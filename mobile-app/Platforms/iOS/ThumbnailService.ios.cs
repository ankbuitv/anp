using CoreGraphics;
using UIKit;

namespace AnpMobile.Services;

public partial class ThumbnailService
{
    private static partial byte[]? MakeJpegThumbPlatform(string filePath, int maxEdge, int quality)
    {
        using var source = UIImage.FromFile(filePath);
        if (source is null) return null;

        var w = source.CGImage is not null ? (double)source.CGImage.Width : (double)source.Size.Width;
        var h = source.CGImage is not null ? (double)source.CGImage.Height : (double)source.Size.Height;
        var scale = Math.Min(1.0, maxEdge / Math.Max(w, h));
        var targetW = Math.Max(1.0, w * scale);
        var targetH = Math.Max(1.0, h * scale);

        var format = new UIGraphicsImageRendererFormat { Scale = 1, Opaque = true };
        using var renderer = new UIGraphicsImageRenderer(new CGSize(targetW, targetH), format);
        var image = renderer.CreateImage(ctx =>
        {
            UIColor.Black.SetFill();
            ctx.FillRect(new CGRect(0, 0, targetW, targetH));
            source.Draw(new CGRect(0, 0, targetW, targetH));
        });
        using var data = image.AsJPEG(quality / 100.0f);
        return data?.ToArray();
    }
}
