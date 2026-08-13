using Foundation;
using Photos;
using UIKit;

namespace AnpMobile.Services;

public partial class MediaLibraryService
{
    private static partial string? SaveToLibraryPlatform(string filePath, string mime)
    {
        var isVideo = mime.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
        var url = new NSUrl(filePath, false);
        PHPhotoLibrary.SharedPhotoLibrary.PerformChanges(
            () =>
            {
                if (isVideo)
                    PHAssetChangeRequest.FromVideo(url);
                else if (UIImage.FromFile(filePath) is { } image)
                    PHAssetChangeRequest.FromImage(image);
            },
            (_, _) => { });
        return filePath;
    }
}
