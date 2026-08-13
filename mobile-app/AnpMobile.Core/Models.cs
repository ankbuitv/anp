using System.Text.Json.Serialization;

namespace AnpMobile.Core;

/// <summary>Chung cho mọi response của API: { ok, data | error }.</summary>
public sealed class ApiEnvelope<T>
{
    [JsonPropertyName("ok")] public bool Ok { get; set; }
    [JsonPropertyName("data")] public T? Data { get; set; }
    [JsonPropertyName("error")] public ApiErrorBody? Error { get; set; }
}

public sealed class ApiErrorBody
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("message")] public string Message { get; set; } = "";
}

public sealed class CursorPage<T>
{
    public List<T> Items { get; set; } = new();
    public string? NextCursor { get; set; }
}

public enum MediaType
{
    Image,
    Video,
}

// ---------- Auth ----------

public sealed class UserPublic
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string? AvatarUrl { get; set; }
    public bool HasVaultPin { get; set; }
    public bool EmailVerified { get; set; }
    public long CreatedAt { get; set; }
}

public sealed class UserSettings
{
    public string? Theme { get; set; }           // dark | light | system
    public int? SlideshowSeconds { get; set; }
}

public sealed class MeInfo
{
    public UserPublic User { get; set; } = new();
    public bool VaultUnlocked { get; set; }
    public UserSettings Settings { get; set; } = new();
}

public sealed class RegisterRequest
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string ConfirmPassword { get; set; } = "";
    public string? DeviceName { get; set; }
    public string? DeviceType { get; set; }
    public string? Platform { get; set; }
}

public sealed class RegisterResponse
{
    public UserPublic User { get; set; } = new();
    public bool EmailQueued { get; set; }
}

public sealed class LoginRequest
{
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string? DeviceName { get; set; }
    public string? DeviceType { get; set; }
    public string? Platform { get; set; }
}

public sealed class LoginResponse
{
    public UserPublic User { get; set; } = new();
}

// ---------- Media ----------

public sealed class MediaAlbumRef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
}

public sealed class Media
{
    public string Id { get; set; } = "";
    public string Filename { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public string Mime { get; set; } = "";
    public MediaType MediaType { get; set; }
    public long Size { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public double? Duration { get; set; }
    public string Checksum { get; set; } = "";
    public long? TakenAt { get; set; }
    public long UploadedAt { get; set; }
    public bool IsFavorite { get; set; }
    public bool IsPrivate { get; set; }
    public long? DeletedAt { get; set; }
    public string? MomentId { get; set; }
    public int Version { get; set; }
    public string ThumbUrl { get; set; } = "";
    public string PreviewUrl { get; set; } = "";
    public string FileUrl { get; set; } = "";
    public bool HasThumb { get; set; }
    public bool HasPreview { get; set; }
    public List<MediaAlbumRef> Albums { get; set; } = new();

    // EXIF
    public string? CameraMake { get; set; }
    public string? CameraModel { get; set; }
    public string? Lens { get; set; }
    public int? Iso { get; set; }
    public string? Aperture { get; set; }
    public string? ShutterSpeed { get; set; }
    public string? FocalLength { get; set; }
    public int? Orientation { get; set; }
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public string? LocationName { get; set; }
    public string? Photographer { get; set; }
}

public sealed class MediaPatch
{
    public string? Filename { get; set; }
    public string? Photographer { get; set; }
    public string? LocationName { get; set; }
    public bool? IsFavorite { get; set; }
    public bool? IsPrivate { get; set; }
}

public sealed class MediaResult
{
    public Media? Media { get; set; }
}

// ---------- Albums ----------

public sealed class Album
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? CoverMediaId { get; set; }
    public string? CoverUrl { get; set; }
    public bool IsPrivate { get; set; }
    public int MediaCount { get; set; }
    public long CreatedAt { get; set; }
    public long UpdatedAt { get; set; }
}

public sealed class AlbumList
{
    public List<Album> Items { get; set; } = new();
}

public sealed class AlbumDetail
{
    public Album Album { get; set; } = new();
    public List<Media> Items { get; set; } = new();
    public string? NextCursor { get; set; }
}

public sealed class AlbumCreateRequest
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsPrivate { get; set; }
}

public sealed class AlbumPatch
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? IsPrivate { get; set; }
}

// ---------- Uploads ----------

public sealed class UploadInitRequest
{
    public string Filename { get; set; } = "";
    public long Size { get; set; }
    public string Mime { get; set; } = "";
    public string Checksum { get; set; } = "";
    public bool? IsPrivate { get; set; }
}

public sealed class UploadInitResponse
{
    public bool Duplicate { get; set; }
    public Media? Media { get; set; }
    public string? UploadId { get; set; }
    public string? MediaId { get; set; }
    public int ChunkSize { get; set; }
    public List<int> UploadedParts { get; set; } = new();
}

public sealed class CompleteUploadResponse
{
    public Media Media { get; set; } = new();
}

// ---------- Storage ----------

public sealed class StorageCount
{
    public long Count { get; set; }
    public long Bytes { get; set; }
}

public sealed class StorageBackend
{
    public string Provider { get; set; } = "none";   // b2 | kv | none
    public string? Bucket { get; set; }
    public bool Healthy { get; set; }
    public string? Message { get; set; }
    public long? Objects { get; set; }
    public long? Bytes { get; set; }
    public bool Truncated { get; set; }
}

public sealed class StorageLargest
{
    public string Id { get; set; } = "";
    public string Filename { get; set; } = "";
    public long Size { get; set; }
    public string MediaType { get; set; } = "";
}

public sealed class StorageInfo
{
    public StorageCount Images { get; set; } = new();
    public StorageCount Videos { get; set; } = new();
    public StorageCount Thumbs { get; set; } = new();
    public StorageCount Other { get; set; } = new();
    public StorageCount Total { get; set; } = new();
    public StorageBackend Backend { get; set; } = new();
    public List<StorageLargest> Largest { get; set; } = new();
}
