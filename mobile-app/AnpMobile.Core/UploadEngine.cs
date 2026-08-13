using System.Security.Cryptography;

namespace AnpMobile.Core;

public enum UploadStatus
{
    Queued,
    Hashing,
    Uploading,
    Processing,
    Done,
    Duplicate,
    Error,
    Cancelled,
}

public sealed class UploadItem : ObservableObject
{
    public int LocalId { get; init; }
    public string FilePath { get; init; } = "";
    public string Name { get; init; } = "";
    public long Size { get; init; }
    public string Mime { get; init; } = "";
    public bool IsPrivate { get; init; }
    public Media? Media { get; internal set; }
    internal string? UploadId { get; set; }
    internal CancellationTokenSource? Cts { get; set; }

    private UploadStatus _status;
    public UploadStatus Status
    {
        get => _status;
        set
        {
            if (SetProperty(ref _status, value))
            {
                OnPropertyChanged(nameof(StatusText));
                OnPropertyChanged(nameof(CanCancel));
                OnPropertyChanged(nameof(CanRetry));
            }
        }
    }

    private double _progress;
    public double Progress { get => _progress; set => SetProperty(ref _progress, value); }

    private long _uploadedBytes;
    public long UploadedBytes
    {
        get => _uploadedBytes;
        set
        {
            if (SetProperty(ref _uploadedBytes, value)) OnPropertyChanged(nameof(UploadedText));
        }
    }

    private string? _error;
    public string? Error
    {
        get => _error;
        set
        {
            if (SetProperty(ref _error, value)) OnPropertyChanged(nameof(HasError));
        }
    }

    public bool HasError => Error is not null;
    public bool IsVideo => Mime.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
    public bool CanCancel => Status is UploadStatus.Queued or UploadStatus.Hashing or UploadStatus.Uploading or UploadStatus.Processing;
    public bool CanRetry => Status is UploadStatus.Error or UploadStatus.Cancelled;
    public string SizeText => Format.Bytes(Size);
    public string UploadedText => Format.Bytes(UploadedBytes);

    public string StatusText => Status switch
    {
        UploadStatus.Queued => "Chờ tải lên",
        UploadStatus.Hashing => "Đang kiểm tra file…",
        UploadStatus.Uploading => "Đang tải lên…",
        UploadStatus.Processing => "Đang hoàn tất…",
        UploadStatus.Done => "Đã tải lên",
        UploadStatus.Duplicate => "Đã có trên ANP",
        UploadStatus.Error => "Lỗi",
        UploadStatus.Cancelled => "Đã hủy",
        _ => "…",
    };
}

/// <summary>
/// Hàng đợi upload resume theo đúng giao thức /uploads của API:
/// checksum SHA-256 → POST /uploads → PUT từng part → POST complete → PUT thumb.
/// </summary>
public sealed class UploadEngine
{
    public const int ChunkSize = 8 * 1024 * 1024; // 8 MB — khớp CHUNK_SIZE của web

    private readonly AnpApi _api;
    private readonly Func<string, byte[]?> _thumbnailer;
    private readonly object _gate = new();
    private readonly List<UploadItem> _items = new();
    private int _active;
    private int _nextId;

    public event Action? Changed;

    public int Concurrency { get; set; } = 2;
    public bool Paused { get; private set; }

    public UploadEngine(AnpApi api, Func<string, byte[]?>? thumbnailer = null)
    {
        _api = api;
        _thumbnailer = thumbnailer ?? (_ => null);
    }

    public IReadOnlyList<UploadItem> Items
    {
        get { lock (_gate) return _items.ToList(); }
    }

    /// <summary>Thêm file vào hàng đợi; trả về null nếu định dạng không được hỗ trợ.</summary>
    public UploadItem? Enqueue(string filePath, string mime, bool isPrivate)
    {
        var name = Path.GetFileName(filePath);
        var size = new FileInfo(filePath).Length;
        if (!MimeUtil.IsAllowed(mime, name)) return null;
        if (string.IsNullOrEmpty(mime)) mime = MimeUtil.GuessMime(name);

        UploadItem item;
        lock (_gate)
        {
            item = new UploadItem
            {
                LocalId = ++_nextId,
                FilePath = filePath,
                Name = name,
                Size = size,
                Mime = mime,
                IsPrivate = isPrivate,
                Status = UploadStatus.Queued,
            };
            _items.Add(item);
        }
        Emit();
        Pump();
        return item;
    }

    public void Cancel(UploadItem item)
    {
        item.Status = UploadStatus.Cancelled;
        item.Cts?.Cancel();
        if (item.UploadId is not null)
            _ = _api.DeleteUploadAsync(item.UploadId).ContinueWith(_ => { }, TaskScheduler.Default);
        Emit();
    }

    public void Retry(UploadItem item)
    {
        item.Error = null;
        item.Progress = 0;
        item.UploadedBytes = 0;
        item.Status = UploadStatus.Queued;
        Emit();
        Pump();
    }

    public void PauseAll()
    {
        Paused = true;
        lock (_gate)
        {
            foreach (var it in _items) it.Cts?.Cancel();
        }
        Emit();
    }

    public void ResumeAll()
    {
        Paused = false;
        lock (_gate)
        {
            foreach (var it in _items)
            {
                if (it.Status == UploadStatus.Queued) continue;
                if (it.Status == UploadStatus.Error) continue;
                it.Status = UploadStatus.Queued;
            }
        }
        Emit();
        Pump();
    }

    public void ClearFinished()
    {
        lock (_gate)
        {
            _items.RemoveAll(i => i.Status is UploadStatus.Done or UploadStatus.Duplicate or UploadStatus.Cancelled);
        }
        Emit();
    }

    public void ClearAll()
    {
        lock (_gate)
        {
            foreach (var it in _items) it.Cts?.Cancel();
            _items.Clear();
        }
        Emit();
    }

    public (int Total, int Done, int Fail, long TotalBytes, long UploadedBytes) Stats()
    {
        lock (_gate)
        {
            var live = _items.Where(i => i.Status != UploadStatus.Cancelled).ToList();
            var done = live.Count(i => i.Status is UploadStatus.Done or UploadStatus.Duplicate);
            var fail = live.Count(i => i.Status == UploadStatus.Error);
            var totalBytes = live.Sum(i => i.Size);
            var uploaded = live.Sum(i => i.Status is UploadStatus.Done or UploadStatus.Duplicate ? i.Size : i.UploadedBytes);
            return (live.Count, done, fail, totalBytes, uploaded);
        }
    }

    private void Emit()
    {
        Changed?.Invoke();
    }

    private async void Pump()
    {
        while (!Paused)
        {
            UploadItem? next;
            lock (_gate)
            {
                if (_active >= Concurrency) return;
                next = _items.FirstOrDefault(i => i.Status == UploadStatus.Queued);
                if (next is null) return;
                next.Status = UploadStatus.Hashing;
                _active++;
            }
            Emit();
            try
            {
                await RunAsync(next);
            }
            finally
            {
                lock (_gate) _active--;
                Emit();
            }
        }
    }

    private async Task RunAsync(UploadItem it)
    {
        try
        {
            it.Cts = new CancellationTokenSource();
            var ct = it.Cts.Token;

            // 1) Checksum — 0..8%
            var checksum = await Sha256HexAsync(it.FilePath, p => it.Progress = p * 0.08, ct);
            if (it.Status == UploadStatus.Cancelled) return;
            it.Status = UploadStatus.Uploading;

            // 2) Khởi tạo phiên upload; nếu trùng checksum thì xong ngay.
            var init = await _api.InitUploadAsync(new UploadInitRequest
            {
                Filename = it.Name,
                Size = it.Size,
                Mime = it.Mime,
                Checksum = checksum,
                IsPrivate = it.IsPrivate,
            }, ct);
            if (init.Duplicate)
            {
                it.Media = init.Media;
                it.Progress = 1;
                it.UploadedBytes = it.Size;
                it.Status = UploadStatus.Duplicate;
                return;
            }
            it.UploadId = init.UploadId;
            var chunk = init.ChunkSize > 0 ? init.ChunkSize : ChunkSize;
            var parts = Math.Max(1, (int)((it.Size + chunk - 1) / chunk));
            var have = new HashSet<int>(init.UploadedParts);

            // 3) Các part — 8..90%
            for (var n = 1; n <= parts; n++)
            {
                ct.ThrowIfCancellationRequested();
                if (have.Contains(n))
                {
                    it.UploadedBytes = Math.Min(it.Size, (long)n * chunk);
                    it.Progress = 0.08 + 0.82 * (n / (double)parts);
                    continue;
                }
                var start = (long)(n - 1) * chunk;
                var len = (int)Math.Min(chunk, it.Size - start);
                var data = new byte[len];
                await using (var fs = new FileStream(it.FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    fs.Seek(start, SeekOrigin.Begin);
                    var off = 0;
                    while (off < len)
                    {
                        var read = await fs.ReadAsync(data.AsMemory(off, len - off), ct);
                        if (read <= 0) throw new IOException("Không đọc được file nguồn.");
                        off += read;
                    }
                }
                await _api.PutPartAsync(it.UploadId, n, data, ct);
                it.UploadedBytes = Math.Min(it.Size, start + len);
                it.Progress = 0.08 + 0.82 * (n / (double)parts);
            }

            // 4) Hoàn tất + thumbnail — 90..100%
            it.Status = UploadStatus.Processing;
            var done = await _api.CompleteUploadAsync(it.UploadId, ct);
            it.Media = done.Media;
            if (it.Media is not null && !it.IsVideo)
            {
                byte[]? thumb = null;
                try { thumb = _thumbnailer(it.FilePath); } catch { thumb = null; }
                if (thumb is { Length: > 0 })
                {
                    for (var attempt = 0; attempt < 2; attempt++)
                    {
                        try { await _api.PutThumbAsync(it.Media.Id, thumb, ct); break; }
                        catch { /* lỗi thumb không làm hỏng file gốc đã tải lên */ }
                    }
                }
            }
            it.Progress = 1;
            it.UploadedBytes = it.Size;
            it.Status = UploadStatus.Done;
        }
        catch (OperationCanceledException)
        {
            if (it.Status != UploadStatus.Cancelled) it.Status = UploadStatus.Queued;
        }
        catch (Exception ex)
        {
            if (it.Status == UploadStatus.Cancelled) return;
            it.Status = UploadStatus.Error;
            it.Error = ex is ApiException apiEx ? apiEx.Message : "Không thể tải lên. Kiểm tra kết nối.";
        }
        finally
        {
            it.Cts?.Dispose();
            it.Cts = null;
        }
    }

    public static async Task<string> Sha256HexAsync(string filePath, Action<double>? progress, CancellationToken ct)
    {
        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 20, useAsync: true);
        var buffer = new byte[1 << 20];
        var total = Math.Max(1, fs.Length);
        long read = 0;
        int n;
        while ((n = await fs.ReadAsync(buffer, ct)) > 0)
        {
            sha.AppendData(buffer, 0, n);
            read += n;
            progress?.Invoke((double)read / total);
        }
        return Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant();
    }
}
