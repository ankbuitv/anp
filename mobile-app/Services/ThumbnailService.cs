namespace AnpMobile.Services;

/// <summary>
/// Sinh thumbnail JPEG cho ảnh tải lên (tương đương makeThumb của web, maxEdge 360).
/// Triển khai native ở Platforms/{Android,iOS}.
/// </summary>
public partial class ThumbnailService
{
    public const int ThumbMaxEdge = 360;

    public static byte[]? MakeJpegThumb(string filePath, int maxEdge = ThumbMaxEdge, int quality = 78)
    {
        try
        {
            return MakeJpegThumbPlatform(filePath, maxEdge, quality);
        }
        catch
        {
            return null;
        }
    }

    private static partial byte[]? MakeJpegThumbPlatform(string filePath, int maxEdge, int quality);
}
