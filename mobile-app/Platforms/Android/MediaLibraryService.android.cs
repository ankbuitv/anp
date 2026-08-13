using Android.Content;
using Android.Media;
using Android.Provider;

namespace AnpMobile.Services;

public partial class MediaLibraryService
{
    private static partial string? SaveToLibraryPlatform(string filePath, string mime)
    {
        var context = Microsoft.Maui.ApplicationModel.Platform.AppContext;
        var isVideo = mime.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
        var collection = isVideo ? MediaStore.Video.Media.ExternalContentUri : MediaStore.Images.Media.ExternalContentUri;

        if (Android.OS.Build.VERSION.SdkInt >= Android.OS.BuildVersionCodes.Q)
        {
            var values = new ContentValues();
            values.Put(MediaStore.IMediaColumns.DisplayName, Path.GetFileName(filePath));
            values.Put(MediaStore.IMediaColumns.MimeType, mime);
            values.Put(MediaStore.IMediaColumns.RelativePath, isVideo ? Android.OS.Environment.DirectoryDcim : Android.OS.Environment.DirectoryPictures);
            var uri = context.ContentResolver?.Insert(collection, values);
            if (uri is null) return null;
            using var input = File.OpenRead(filePath);
            using var output = context.ContentResolver?.OpenOutputStream(uri);
            if (output is null) return null;
            input.CopyTo(output);
            return uri.ToString();
        }

        // Android < 10: chép vào thư mục công khai rồi quét MediaScanner.
        var dir = isVideo
            ? Android.OS.Environment.GetExternalStoragePublicDirectory(Android.OS.Environment.DirectoryDcim)
            : Android.OS.Environment.GetExternalStoragePublicDirectory(Android.OS.Environment.DirectoryPictures);
        if (dir is null) return null;
        var dest = Path.Combine(dir.AbsolutePath!, Path.GetFileName(filePath));
        File.Copy(filePath, dest, true);
        MediaScannerConnection.ScanFile(context, new[] { dest }, null, (MediaScannerConnection.IOnScanCompletedListener?)null);
        return dest;
    }
}
