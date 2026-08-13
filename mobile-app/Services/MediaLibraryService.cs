namespace AnpMobile.Services;

/// <summary>
/// Lưu file ảnh/video vào thư viện ảnh của thiết bị.
/// Triển khai native ở Platforms/{Android,iOS}; MacCatalyst lưu vào Downloads.
/// </summary>
public partial class MediaLibraryService
{
    public static string? SaveToLibrary(string filePath, string mime)
    {
        try
        {
            return SaveToLibraryPlatform(filePath, mime);
        }
        catch
        {
            return null;
        }
    }

    private static partial string? SaveToLibraryPlatform(string filePath, string mime);
}
