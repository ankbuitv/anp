using AnpMobile.Core;
using Microsoft.Maui.Storage;

namespace AnpMobile.Services;

/// <summary>Lưu cookie phiên vào SecureStorage (Keychain / Keystore).</summary>
public sealed class SecureSessionStore : ISessionStore
{
    private const string Key = "anp_cookies";

    public async Task SaveAsync(string cookieHeader)
    {
        try
        {
            await SecureStorage.Default.SetAsync(Key, cookieHeader);
        }
        catch
        {
            // Thiết bị không hỗ trợ SecureStorage: dự phòng Preferences.
            Preferences.Default.Set(Key, cookieHeader);
        }
    }

    public async Task<string?> LoadAsync()
    {
        try
        {
            var value = await SecureStorage.Default.GetAsync(Key);
            if (value is not null) return value;
        }
        catch
        {
            // fall through
        }
        return Preferences.Default.Get(Key, (string?)null);
    }

    public Task ClearAsync()
    {
        try
        {
            SecureStorage.Default.Remove(Key);
        }
        catch
        {
            // ignore
        }
        Preferences.Default.Remove(Key);
        return Task.CompletedTask;
    }
}
