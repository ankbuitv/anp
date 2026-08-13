using AnpMobile.Core;
using Microsoft.Maui.Storage;

namespace AnpMobile.Services;

/// <summary>
/// Cache thumbnail/preview/file theo mediaId + version: bộ nhớ (thumb nhỏ) + đĩa
/// (AppDataDirectory). Mọi request đi qua HttpClient của AnpApi nên có cookie phiên.
/// Thư mục cache được tách theo tài khoản để không lộ dữ liệu giữa các user.
/// </summary>
public sealed class ImageCache
{
    private const int MemoryLimit = 200;

    private readonly AnpApi _api;
    private readonly object _lock = new();
    private readonly Dictionary<string, byte[]> _memory = new();
    private readonly Dictionary<string, Task<string?>> _inflight = new();
    private readonly string _root;
    private string _scope = "anon";

    public ImageCache(AnpApi api)
    {
        _api = api;
        _root = Path.Combine(FileSystem.AppDataDirectory, "cache");
    }

    public void SetUserScope(string userId)
    {
        _scope = Sanitize(userId);
        ClearMemory();
    }

    public void ClearMemory()
    {
        lock (_lock)
        {
            _memory.Clear();
            _inflight.Clear();
        }
    }

    public void Invalidate(string mediaId)
    {
        try
        {
            var dir = DirFor("thumbs");
            foreach (var file in Directory.EnumerateFiles(dir, $"t-{mediaId}-*.jpg"))
                File.Delete(file);
        }
        catch
        {
            // ignore
        }
    }

    // ---------- Thumbs ----------

    public Task<string?> ThumbPathAsync(Media media, CancellationToken ct = default) =>
        GetAsync($"t-{media.Id}-{media.Version}", media.HasThumb,
            tok => _api.DownloadThumbAsync(media.Id, tok), "thumbs", "jpg", ct);

    public Task<string?> PreviewPathAsync(Media media, IProgress<double>? progress = null, CancellationToken ct = default) =>
        GetAsync($"p-{media.Id}-{media.Version}", media.HasPreview,
            tok => _api.DownloadPreviewAsync(media.Id, tok), "thumbs", "jpg", ct);

    public Task<string?> AlbumCoverPathAsync(Album album, CancellationToken ct = default) =>
        GetAsync($"ac-{album.Id}-{album.UpdatedAt}", album.CoverUrl is not null,
            tok => _api.DownloadMediaUrlAsync(album.CoverUrl!, tok), "thumbs", "jpg", ct);

    // ---------- File gốc ----------

    /// <summary>Tải (hoặc lấy từ cache) file gốc ảnh/video. Hỗ trợ resume cho video lớn.</summary>
    public Task<string?> FilePathAsync(Media media, IProgress<double>? progress = null, CancellationToken ct = default)
    {
        var key = $"f-{media.Id}-{media.Version}";
        var file = Path.Combine(DirFor("files"), $"{key}{MimeUtil.ExtFor(media)}");
        if (File.Exists(file))
        {
            try
            {
                if (new FileInfo(file).Length == media.Size) return Task.FromResult<string?>(file);
            }
            catch
            {
                // fall through
            }
        }

        lock (_lock)
        {
            if (_inflight.TryGetValue(key, out var existing)) return existing;
            var task = DownloadFileCoreAsync(key, file, media, progress, ct);
            _inflight[key] = task;
            return task;
        }
    }

    private async Task<string?> DownloadFileCoreAsync(string key, string file, Media media, IProgress<double>? progress, CancellationToken ct)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            long existing = 0;
            if (File.Exists(file))
            {
                try { existing = new FileInfo(file).Length; } catch { existing = 0; }
            }
            await using (var fs = new FileStream(file, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None))
            {
                if (existing > 0 && existing < media.Size) fs.Seek(existing, SeekOrigin.Begin);
                else if (existing >= media.Size) { fs.SetLength(0); fs.Seek(0, SeekOrigin.Begin); }
                await _api.DownloadFileAsync(media.Id, fs, existing > 0 && existing < media.Size ? existing : null, progress, ct);
            }
            var length = new FileInfo(file).Length;
            if (length != media.Size)
            {
                File.Delete(file);
                return null;
            }
            return file;
        }
        catch
        {
            return null;
        }
        finally
        {
            lock (_lock) _inflight.Remove(key);
        }
    }

    // ---------- Nội bộ ----------

    private Task<string?> GetAsync(
        string key,
        bool enabled,
        Func<CancellationToken, Task<byte[]>> fetch,
        string subdir,
        string ext,
        CancellationToken ct)
    {
        if (!enabled) return Task.FromResult<string?>(null);
        var file = Path.Combine(DirFor(subdir), $"{key}.{ext}");
        if (File.Exists(file)) return Task.FromResult<string?>(file);

        lock (_lock)
        {
            if (_memory.TryGetValue(key, out var cached))
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
                    File.WriteAllBytes(file, cached);
                }
                catch
                {
                    // ignore
                }
                return Task.FromResult<string?>(file);
            }
            if (_inflight.TryGetValue(key, out var existing)) return existing;
            var task = DownloadCoreAsync(key, fetch, file, ct);
            _inflight[key] = task;
            return task;
        }
    }

    private async Task<string?> DownloadCoreAsync(string key, Func<CancellationToken, Task<byte[]>> fetch, string file, CancellationToken ct)
    {
        try
        {
            var bytes = await fetch(ct);
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(file)!);
                await File.WriteAllBytesAsync(file, bytes, ct);
            }
            catch
            {
                // không ghi được cache thì vẫn trả path để UI báo lỗi nhẹ nhàng
            }
            MemoryAdd(key, bytes);
            return file;
        }
        catch
        {
            return null;
        }
        finally
        {
            lock (_lock) _inflight.Remove(key);
        }
    }

    private void MemoryAdd(string key, byte[] bytes)
    {
        lock (_lock)
        {
            if (_memory.Count >= MemoryLimit) _memory.Clear();
            _memory[key] = bytes;
        }
    }

    private string DirFor(string subdir)
    {
        var dir = Path.Combine(_root, _scope, subdir);
        try { Directory.CreateDirectory(dir); } catch { /* ignore */ }
        return dir;
    }

    private static string Sanitize(string userId)
    {
        var valid = new string(userId.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
        return valid.Length > 0 ? valid : "anon";
    }
}
