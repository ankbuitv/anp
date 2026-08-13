using Android.Graphics;

namespace AnpMobile.Services;

public partial class ThumbnailService
{
    private static partial byte[]? MakeJpegThumbPlatform(string filePath, int maxEdge, int quality)
    {
        // 1) Đọc kích thước gốc để chọn inSampleSize.
        using var bounds = new BitmapFactory.Options { InJustDecodeBounds = true };
        BitmapFactory.DecodeFile(filePath, bounds);
        if (bounds.OutWidth <= 0 || bounds.OutHeight <= 0) return null;

        var maxDim = Math.Max(bounds.OutWidth, bounds.OutHeight);
        var sample = 1;
        while (maxDim / (sample * 2) >= maxEdge * 2) sample *= 2;

        using var decode = new BitmapFactory.Options { InSampleSize = sample };
        using var bitmap = BitmapFactory.DecodeFile(filePath, decode);
        if (bitmap is null) return null;

        // 2) Thu nhỏ về maxEdge.
        var scale = Math.Min(1.0, (double)maxEdge / Math.Max(bitmap.Width, bitmap.Height));
        Bitmap? scaled = null;
        try
        {
            if (scale < 0.999)
            {
                var w = Math.Max(1, (int)Math.Round(bitmap.Width * scale));
                var h = Math.Max(1, (int)Math.Round(bitmap.Height * scale));
                scaled = Bitmap.CreateScaledBitmap(bitmap, w, h, true);
            }
            else
            {
                scaled = bitmap;
            }

            // 3) Xoay theo EXIF (API 24+; API 23 hiếm gặp bỏ qua).
            Bitmap? rotated = null;
            try
            {
                if (Android.OS.Build.VERSION.SdkInt >= Android.OS.BuildVersionCodes.N)
                {
                    var exif = new Android.Media.ExifInterface(filePath);
                    var orientation = exif.GetAttributeInt(Android.Media.ExifInterface.TagOrientation, 1);
                    if (orientation != 1)
                    {
                        var matrix = new Matrix();
                        switch (orientation)
                        {
                            case 3: matrix.PostRotate(180); break;
                            case 6: matrix.PostRotate(90); break;
                            case 8: matrix.PostRotate(270); break;
                            default: return CompressJpeg(scaled, quality);
                        }
                        rotated = Bitmap.CreateBitmap(scaled, 0, 0, scaled.Width, scaled.Height, matrix, true);
                        if (rotated != scaled && rotated is not null)
                        {
                            if (scaled != bitmap) scaled.Recycle();
                            scaled = rotated;
                        }
                    }
                }
            }
            catch
            {
                // không đọc được EXIF: giữ nguyên ảnh
            }

            return CompressJpeg(scaled, quality);
        }
        finally
        {
            if (scaled is not null && !ReferenceEquals(scaled, bitmap)) scaled.Recycle();
        }
    }

    private static byte[]? CompressJpeg(Bitmap bitmap, int quality)
    {
        using var stream = new MemoryStream();
        if (!bitmap.Compress(Bitmap.CompressFormat.Jpeg!, quality, stream)) return null;
        return stream.ToArray();
    }
}
