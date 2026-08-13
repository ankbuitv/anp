using AnpMobile.Core;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.Services;

/// <summary>Trạng thái đăng nhập + phiên hiện tại của app.</summary>
public sealed class AppState
{
    private readonly AnpApi _api;
    private readonly ImageCache _cache;

    public MeInfo? Me { get; private set; }
    public UserPublic? User => Me?.User;
    public bool IsLoggedIn => Me is not null;
    public bool HasVaultPin => Me?.User.HasVaultPin ?? false;
    public bool VaultUnlocked => Me?.VaultUnlocked ?? false;

    public event Action? Changed;

    public AppState(AnpApi api, ImageCache cache)
    {
        _api = api;
        _cache = cache;
    }

    public async Task<bool> RestoreSessionAsync()
    {
        var ok = await _api.TryRestoreSessionAsync();
        if (ok)
        {
            await RefreshMeAsync();
            if (Me is not null)
            {
                _cache.SetUserScope(Me.User.Id);
                App.ApplyTheme(Me.Settings.Theme);
            }
        }
        return ok;
    }

    public async Task LoginAsync(string email, string password)
    {
        await _api.LoginAsync(new LoginRequest
        {
            Email = email,
            Password = password,
            DeviceType = PlatformInfo.DeviceType,
            DeviceName = PlatformInfo.DeviceName,
            Platform = PlatformInfo.Platform,
        });
        await _api.PersistSessionAsync();
        await RefreshMeAsync();
        if (Me is not null) _cache.SetUserScope(Me.User.Id);
        App.ApplyTheme(Me?.Settings.Theme);
    }

    public async Task RegisterAsync(string name, string email, string password, string confirmPassword)
    {
        await _api.RegisterAsync(new RegisterRequest
        {
            Name = name,
            Email = email,
            Password = password,
            ConfirmPassword = confirmPassword,
            DeviceType = PlatformInfo.DeviceType,
            DeviceName = PlatformInfo.DeviceName,
            Platform = PlatformInfo.Platform,
        });
        await _api.PersistSessionAsync();
        await RefreshMeAsync();
        if (Me is not null) _cache.SetUserScope(Me.User.Id);
        App.ApplyTheme(Me?.Settings.Theme);
    }

    public async Task RefreshMeAsync()
    {
        Me = await _api.MeAsync();
        Changed?.Invoke();
    }

    public async Task LogoutAsync()
    {
        try { await _api.LogoutAsync(); } catch { /* phiên hết hạn cũng phải thoát được */ }
        _api.ClearSession();
        Me = null;
        _cache.ClearMemory();
        Changed?.Invoke();
    }

    public async Task SetVaultPinAsync(string pin, string confirmPin)
    {
        await _api.SetVaultPinAsync(pin, confirmPin);
        await _api.PersistSessionAsync();
        await RefreshMeAsync();
    }

    public async Task UnlockVaultAsync(string pin)
    {
        await _api.UnlockVaultAsync(pin);
        await _api.PersistSessionAsync();
        await RefreshMeAsync();
    }

    public async Task LockVaultAsync()
    {
        await _api.LockVaultAsync();
        await RefreshMeAsync();
    }
}
