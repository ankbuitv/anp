using System.Globalization;

namespace AnpMobile.Core;

public static class Format
{
    public static string Bytes(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        double value = bytes;
        string[] units = { "KB", "MB", "GB", "TB" };
        var unit = -1;
        do { value /= 1024; unit++; } while (value >= 1024 && unit < units.Length - 1);
        return $"{value.ToString(value >= 100 ? "0" : "0.#", CultureInfo.InvariantCulture)} {units[unit]}";
    }

    public static string Duration(double? seconds)
    {
        if (seconds is null or < 0) return "";
        var total = (int)Math.Round(seconds.Value);
        var h = total / 3600;
        var m = total % 3600 / 60;
        var s = total % 60;
        return h > 0 ? $"{h}:{m:00}:{s:00}" : $"{m}:{s:00}";
    }

    public static string Date(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    public static string DateTimeStr(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);

    public static string Initials(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "?";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var first = parts[0][0];
        var last = parts.Length > 1 ? parts[^1][0] : (parts[0].Length > 1 ? parts[0][1] : '\0');
        return last == '\0' ? first.ToString().ToUpperInvariant() : ("" + first + last).ToUpperInvariant();
    }
}

public static class MimeUtil
{
    private static readonly HashSet<string> ImageMimes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
        "image/avif", "image/tiff", "image/bmp",
    };

    private static readonly HashSet<string> VideoMimes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/x-msvideo", "video/x-matroska",
    };

    private static readonly Dictionary<string, string> MimeByExt = new(StringComparer.OrdinalIgnoreCase)
    {
        ["jpg"] = "image/jpeg", ["jpeg"] = "image/jpeg", ["png"] = "image/png", ["webp"] = "image/webp",
        ["gif"] = "image/gif", ["heic"] = "image/heic", ["heif"] = "image/heif", ["avif"] = "image/avif",
        ["tif"] = "image/tiff", ["tiff"] = "image/tiff", ["bmp"] = "image/bmp",
        ["mp4"] = "video/mp4", ["mov"] = "video/quicktime", ["webm"] = "video/webm",
        ["m4v"] = "video/x-m4v", ["avi"] = "video/x-msvideo", ["mkv"] = "video/x-matroska",
    };

    public static bool IsAllowed(string? mime, string name)
    {
        var effective = string.IsNullOrEmpty(mime) ? GuessMime(name) : mime;
        return ImageMimes.Contains(effective) || VideoMimes.Contains(effective);
    }

    public static string GuessMime(string name)
    {
        var ext = Path.GetExtension(name).TrimStart('.').ToLowerInvariant();
        return MimeByExt.TryGetValue(ext, out var mime) ? mime : "";
    }

    public static string ExtFor(Media m)
    {
        var byMime = m.Mime switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            "image/heic" => ".heic",
            "image/heif" => ".heif",
            "video/mp4" => ".mp4",
            "video/quicktime" => ".mov",
            _ => "",
        };
        if (byMime.Length > 0) return byMime;
        var ext = Path.GetExtension(m.OriginalName);
        return ext.Length > 0 && ext.Length <= 6 ? ext.ToLowerInvariant() : ".jpg";
    }
}
