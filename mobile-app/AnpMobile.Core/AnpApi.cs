using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AnpMobile.Core;

public sealed class ApiException : Exception
{
    public string Code { get; }
    public int Status { get; }

    public ApiException(string code, string message, int status) : base(message)
    {
        Code = code;
        Status = status;
    }
}

/// <summary>Lưu/khôi phục cookie phiên (anp_session, anp_vault) qua kho bảo mật của máy.</summary>
public interface ISessionStore
{
    Task SaveAsync(string cookieHeader);
    Task<string?> LoadAsync();
    Task ClearAsync();
}

public sealed class MediaQuery
{
    public string? Type;        // "image" | "video"
    public bool? Favorite;
    public string? Search;
    public string? AlbumId;
    public bool Private;
    public int? Recent;         // 1 | 7 | 30
    public string Sort = "taken";
    public string? Cursor;
    public int Limit = 60;

    public string ToQueryString()
    {
        var parts = new List<string>();
        if (Type is not null) parts.Add($"type={Uri.EscapeDataString(Type)}");
        if (Favorite is not null) parts.Add($"favorite={(Favorite.Value ? 1 : 0)}");
        if (!string.IsNullOrWhiteSpace(Search)) parts.Add($"q={Uri.EscapeDataString(Search)}");
        if (AlbumId is not null) parts.Add($"albumId={Uri.EscapeDataString(AlbumId)}");
        if (Private) parts.Add("private=1");
        if (Recent is not null) parts.Add($"recent={Recent.Value}");
        if (Sort is not null) parts.Add($"sort={Sort}");
        if (Cursor is not null) parts.Add($"cursor={Uri.EscapeDataString(Cursor)}");
        parts.Add($"limit={Limit}");
        return "?" + string.Join("&", parts);
    }
}

/// <summary>
/// Client gọi REST API /api/v1 (xem docs/api.md). Giữ cookie phiên trong
/// CookieContainer, không cần đọc token.
/// </summary>
public sealed class AnpApi : IDisposable
{
    public const string ProductionUrl = "https://p.ankb.qzz.io";
    private const int SessionHttp = 401;

    private static readonly JsonSerializerOptions JsonOpts = CreateJsonOptions();

    private readonly HttpClientHandler _handler;
    private readonly HttpClient _http;
    private readonly ISessionStore? _store;

    public string ServerUrl { get; private set; }
    public Uri BaseUri => _http.BaseAddress!;

    public AnpApi(string? serverUrl = null, ISessionStore? sessionStore = null)
    {
        _store = sessionStore;
        ServerUrl = NormalizeUrl(serverUrl);
        _handler = new HttpClientHandler
        {
            CookieContainer = new CookieContainer(),
            UseCookies = true,
            AutomaticDecompression = DecompressionMethods.All,
        };
        _http = new HttpClient(_handler)
        {
            BaseAddress = new Uri(ServerUrl + "/api/v1/"),
            Timeout = TimeSpan.FromMinutes(30),
        };
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
        opts.Converters.Add(new JsonStringEnumConverter());
        return opts;
    }

    private static string NormalizeUrl(string? url)
    {
        var value = (url ?? ProductionUrl).Trim().TrimEnd('/');
        if (value.Length == 0) value = ProductionUrl;
        if (!value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            value = "https://" + value;
        return value;
    }

    public void Dispose()
    {
        _http.Dispose();
        _handler.Dispose();
    }

    /// <summary>Đổi máy chủ (dùng khi test local); bỏ toàn bộ phiên hiện tại.</summary>
    public void SetServerUrl(string? url)
    {
        ServerUrl = NormalizeUrl(url);
        _http.BaseAddress = new Uri(ServerUrl + "/api/v1/");
        _handler.CookieContainer = new CookieContainer();
    }

    /// <summary>Biến URL tương đối của API (vd /api/v1/media/x/thumb) thành URL tuyệt đối.</summary>
    public Uri ResolveMediaUrl(string pathOrUrl)
    {
        if (Uri.TryCreate(pathOrUrl, UriKind.Absolute, out var abs) &&
            (abs.Scheme == Uri.UriSchemeHttp || abs.Scheme == Uri.UriSchemeHttps))
            return abs;
        return new Uri(new Uri(ServerUrl + "/"), pathOrUrl.TrimStart('/'));
    }

    // ---------------- Session ----------------

    public async Task PersistSessionAsync()
    {
        if (_store is null) return;
        var cookies = _handler.CookieContainer.GetCookies(BaseUri);
        if (cookies.Count == 0)
        {
            await _store.ClearAsync();
            return;
        }
        var parts = new List<string>();
        foreach (Cookie c in cookies)
            parts.Add($"{c.Name}={c.Value}; Path={c.Path}; Expires={c.Expires:r}");
        // Mỗi cookie một dòng: đúng cú pháp Set-Cookie khi khôi phục.
        await _store.SaveAsync(string.Join("\n", parts));
    }

    /// <summary>Khôi phục cookie đã lưu rồi kiểm tra bằng /auth/me.</summary>
    public async Task<bool> TryRestoreSessionAsync(CancellationToken ct = default)
    {
        var header = _store is null ? null : await _store.LoadAsync();
        if (string.IsNullOrWhiteSpace(header)) return false;
        try
        {
            foreach (var line in header.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                if (line.Contains('='))
                    _handler.CookieContainer.SetCookies(BaseUri, line.Trim());
            }
        }
        catch
        {
            ClearSession();
            return false;
        }
        try
        {
            await MeAsync(ct);
            return true;
        }
        catch (ApiException ex) when (ex.Status == SessionHttp)
        {
            ClearSession();
            return false;
        }
        catch
        {
            // Mạng hỏng: giữ phiên để thử lại sau.
            return true;
        }
    }

    public void ClearSession()
    {
        _handler.CookieContainer = new CookieContainer();
        if (_store is not null) _ = _store.ClearAsync();
    }

    // ---------------- Auth ----------------

    public Task<RegisterResponse> RegisterAsync(RegisterRequest r, CancellationToken ct = default) =>
        JsonAsync<RegisterResponse>(HttpMethod.Post, "auth/register", r, ct);

    public Task<LoginResponse> LoginAsync(LoginRequest r, CancellationToken ct = default) =>
        JsonAsync<LoginResponse>(HttpMethod.Post, "auth/login", r, ct);

    public Task LogoutAsync(CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "auth/logout", null, ct);

    public Task<MeInfo> MeAsync(CancellationToken ct = default) =>
        JsonAsync<MeInfo>(HttpMethod.Get, "auth/me", null, ct);

    public Task<UserPublic> UpdateProfileAsync(string name, CancellationToken ct = default) =>
        JsonAsync<UserPublic>(HttpMethod.Patch, "auth/me", new { name }, ct);

    public Task UpdateSettingsAsync(UserSettings settings, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Patch, "auth/settings", settings, ct);

    public Task SetVaultPinAsync(string pin, string confirmPin, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "auth/vault/pin", new { pin, confirmPin }, ct);

    public Task ChangeVaultPinAsync(string currentPin, string pin, string confirmPin, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "auth/vault/pin", new { currentPin, pin, confirmPin }, ct);

    public Task UnlockVaultAsync(string pin, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "auth/vault/unlock", new { pin }, ct);

    public Task LockVaultAsync(CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "auth/vault/lock", null, ct);

    // ---------------- Media ----------------

    public Task<CursorPage<Media>> ListMediaAsync(MediaQuery query, CancellationToken ct = default) =>
        JsonAsync<CursorPage<Media>>(HttpMethod.Get, "media" + query.ToQueryString(), null, ct);

    public Task<Media> GetMediaAsync(string id, CancellationToken ct = default) =>
        JsonAsync<Media>(HttpMethod.Get, $"media/{id}", null, ct);

    public Task<MediaResult> PatchMediaAsync(string id, MediaPatch patch, CancellationToken ct = default) =>
        JsonAsync<MediaResult>(HttpMethod.Patch, $"media/{id}", patch, ct);

    public Task BatchFavoriteAsync(IReadOnlyCollection<string> ids, bool value, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, $"media/batch/favorite?value={(value ? 1 : 0)}", new { ids }, ct);

    public Task BatchPrivateAsync(IReadOnlyCollection<string> ids, bool value, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, $"media/batch/private?value={(value ? 1 : 0)}", new { ids }, ct);

    public Task BatchDeleteAsync(IReadOnlyCollection<string> ids, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "media/batch/delete", new { ids }, ct);

    // ---------------- Media binaries (cookie auth, không phải envelope JSON) ----------------

    public Task<byte[]> DownloadThumbAsync(string id, CancellationToken ct = default) =>
        GetBytesAsync($"media/{id}/thumb", ct);

    public Task<byte[]> DownloadPreviewAsync(string id, CancellationToken ct = default) =>
        GetBytesAsync($"media/{id}/preview", ct);

    /// <summary>Tải dữ liệu từ URL media của API (vd /api/v1/media/x/thumb — album cover).</summary>
    public Task<byte[]> DownloadMediaUrlAsync(string pathOrUrl, CancellationToken ct = default) =>
        GetBytesAsync(pathOrUrl, ct);

    /// <summary>
    /// Tải file gốc (ảnh/video) vào <paramref name="target"/>. Hỗ trợ resume bằng Range
    /// khi <paramref name="resumeFrom"/> &gt; 0 — lúc đó target phải đang ở chế độ nối tiếp.
    /// Trả về số byte ghi được.
    /// </summary>
    public async Task<long> DownloadFileAsync(
        string id,
        Stream target,
        long? resumeFrom = null,
        IProgress<double>? progress = null,
        CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"media/{id}/file");
        if (resumeFrom is > 0) req.Headers.Range = new RangeHeaderValue(resumeFrom, null);
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        if (resp.StatusCode == HttpStatusCode.Unauthorized)
            throw new ApiException("unauthorized", "Phiên đăng nhập đã hết hạn.", SessionHttp);
        if (resp.StatusCode == HttpStatusCode.Forbidden)
            throw new ApiException("forbidden", "Private Vault đang khóa.", 403);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            throw new ApiException("not_found", "Không tìm thấy file.", 404);
        if (resp.StatusCode != HttpStatusCode.OK && resp.StatusCode != HttpStatusCode.PartialContent)
            throw new ApiException("download", $"Không thể tải file (HTTP {(int)resp.StatusCode}).", (int)resp.StatusCode);

        if (resp.StatusCode == HttpStatusCode.OK)
        {
            if (target.CanSeek) target.SetLength(0);
            else target.Flush(); // caller phải mở lại stream nếu cần ghi đè
            if (target.CanSeek) target.Seek(0, SeekOrigin.Begin);
        }

        var start = resumeFrom.GetValueOrDefault(0);
        var total = resp.Content.Headers.ContentLength;
        long written = 0;
        var buffer = new byte[128 * 1024];
        await using var source = await resp.Content.ReadAsStreamAsync(ct);
        int n;
        while ((n = await source.ReadAsync(buffer, ct)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, n), ct);
            written += n;
            if (total is > 0 && progress is not null)
                progress.Report(Math.Min(1.0, (double)(start + written) / total));
        }
        await target.FlushAsync(ct);
        return written;
    }

    private async Task<byte[]> GetBytesAsync(string path, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(
            HttpMethod.Get,
            path.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? path
                : path.TrimStart('/'));
        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        if (resp.StatusCode == HttpStatusCode.Unauthorized)
            throw new ApiException("unauthorized", "Phiên đăng nhập đã hết hạn.", SessionHttp);
        if (resp.StatusCode == HttpStatusCode.Forbidden)
            throw new ApiException("forbidden", "Private Vault đang khóa.", 403);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            throw new ApiException("not_found", "Không tìm thấy dữ liệu.", 404);
        if (!resp.IsSuccessStatusCode)
            throw new ApiException("server_error", $"Không thể tải dữ liệu (HTTP {(int)resp.StatusCode}).", (int)resp.StatusCode);
        return await resp.Content.ReadAsByteArrayAsync(ct);
    }

    // ---------------- Uploads ----------------

    public Task<UploadInitResponse> InitUploadAsync(UploadInitRequest r, CancellationToken ct = default) =>
        JsonAsync<UploadInitResponse>(HttpMethod.Post, "uploads", r, ct);

    public async Task PutPartAsync(string uploadId, int partNumber, byte[] chunk, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Put, $"uploads/{uploadId}/parts/{partNumber}")
        {
            Content = new ByteArrayContent(chunk),
        };
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var resp = await _http.SendAsync(req, ct);
        var text = await resp.Content.ReadAsStringAsync(ct);
        Parse<object>(text, (int)resp.StatusCode);
    }

    public Task<CompleteUploadResponse> CompleteUploadAsync(string uploadId, CancellationToken ct = default) =>
        JsonAsync<CompleteUploadResponse>(HttpMethod.Post, $"uploads/{uploadId}/complete", null, ct);

    public async Task PutThumbAsync(string mediaId, byte[] jpeg, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Put, $"uploads/{mediaId}/thumb")
        {
            Content = new ByteArrayContent(jpeg),
        };
        req.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        using var resp = await _http.SendAsync(req, ct);
        var text = await resp.Content.ReadAsStringAsync(ct);
        Parse<object>(text, (int)resp.StatusCode);
    }

    public Task DeleteUploadAsync(string uploadId, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Delete, $"uploads/{uploadId}", null, ct);

    public Task NotifyBatchAsync(int ok, int fail, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, "uploads/notify-batch", new { ok, fail }, ct);

    // ---------------- Albums ----------------

    public Task<AlbumList> ListAlbumsAsync(CancellationToken ct = default) =>
        JsonAsync<AlbumList>(HttpMethod.Get, "albums", null, ct);

    public Task<Album> CreateAlbumAsync(string name, string? description, bool isPrivate, CancellationToken ct = default) =>
        JsonAsync<Album>(HttpMethod.Post, "albums", new AlbumCreateRequest { Name = name, Description = description, IsPrivate = isPrivate }, ct);

    public Task<Album> UpdateAlbumAsync(string id, AlbumPatch patch, CancellationToken ct = default) =>
        JsonAsync<Album>(HttpMethod.Patch, $"albums/{id}", patch, ct);

    public Task DeleteAlbumAsync(string id, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Delete, $"albums/{id}", null, ct);

    public Task<AlbumDetail> GetAlbumAsync(string id, CancellationToken ct = default) =>
        JsonAsync<AlbumDetail>(HttpMethod.Get, $"albums/{id}", null, ct);

    public Task AddAlbumItemsAsync(string id, IReadOnlyCollection<string> mediaIds, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Post, $"albums/{id}/items", new { mediaIds }, ct);

    public Task RemoveAlbumItemsAsync(string id, IReadOnlyCollection<string> mediaIds, CancellationToken ct = default) =>
        JsonAsync<object>(HttpMethod.Delete, $"albums/{id}/items", new { mediaIds }, ct);

    // ---------------- Storage ----------------

    public Task<StorageInfo> GetStorageAsync(CancellationToken ct = default) =>
        JsonAsync<StorageInfo>(HttpMethod.Get, "storage", null, ct);

    // ---------------- Core HTTP ----------------

    private async Task<T> JsonAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            var json = JsonSerializer.Serialize(body, JsonOpts);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }
        using var resp = await _http.SendAsync(req, ct);
        var text = await resp.Content.ReadAsStringAsync(ct);
        return Parse<T>(text, (int)resp.StatusCode);
    }

    internal static T Parse<T>(string text, int status)
    {
        ApiEnvelope<T>? env = null;
        try
        {
            env = JsonSerializer.Deserialize<ApiEnvelope<T>>(text, JsonOpts);
        }
        catch
        {
            env = null;
        }
        if (env is null || !env.Ok)
        {
            var code = env?.Error?.Code ?? "server_error";
            var message = env?.Error?.Message ?? $"Máy chủ trả về lỗi (HTTP {status}).";
            throw new ApiException(code, message, status);
        }
        return env.Data!;
    }
}
