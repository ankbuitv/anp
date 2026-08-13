using Microsoft.Maui.Devices;

namespace AnpMobile.Services;

public static class PlatformInfo
{
    public static string DeviceType
    {
        get
        {
            var platform = DeviceInfo.Current.Platform;
            if (platform == DevicePlatform.Android) return "android";
            if (platform == DevicePlatform.iOS) return "ios";
            return "desktop";
        }
    }

    public static string DeviceName
    {
        get
        {
            var value = $"{DeviceInfo.Current.Manufacturer} {DeviceInfo.Current.Model}".Trim();
            return value.Length > 0 ? value : "Thiết bị ANP";
        }
    }

    public static string Platform =>
        $"{DeviceInfo.Current.Platform} {DeviceInfo.Current.VersionString}".Trim();

    public static string AppVersion =>
        AppInfo.Current.VersionString + " (" + AppInfo.Current.BuildString + ")";
}
