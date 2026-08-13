using AnpMobile.Core;
using AnpMobile.Services;
using Microsoft.Maui.Storage;

namespace AnpMobile.ViewModels;

public sealed class SettingsViewModel : ObservableObject
{
    private readonly AppState _state;
    private readonly AnpApi _api;
    private string _serverUrl;
    private string _storageText = "";
    private string? _backendText;
    private string? _errorText;

    public string ServerUrl { get => _serverUrl; set => SetProperty(ref _serverUrl, value); }
    public string StorageText { get => _storageText; set => SetProperty(ref _storageText, value); }
    public string? BackendText { get => _backendText; set => SetProperty(ref _backendText, value); }
    public string? ErrorText { get => _errorText; set { if (SetProperty(ref _errorText, value)) OnPropertyChanged(nameof(HasError)); } }
    public bool HasError => ErrorText is not null;

    public UserPublic? User => _state.User;
    public string Name => _state.User?.Name ?? "";
    public string Email => _state.User?.Email ?? "";
    public string Initials => Format.Initials(Name);
    public string ThemeText => _state.Me?.Settings.Theme switch
    {
        "light" => "Sáng",
        "dark" => "Tối",
        _ => "Hệ thống",
    };
    public string AppVersion => "ANP " + PlatformInfo.AppVersion;

    public Command SaveServerCommand { get; }
    public Command LogoutCommand { get; }
    public Command RefreshStorageCommand { get; }

    public SettingsViewModel(AppState state, AnpApi api)
    {
        _state = state;
        _api = api;
        _serverUrl = api.ServerUrl;
        _state.Changed += Sync;
        SaveServerCommand = new Command(async () => await SaveServerAsync());
        LogoutCommand = new Command(async () => await LogoutAsync());
        RefreshStorageCommand = new Command(async () => await LoadStorageAsync());
    }

    public void Sync()
    {
        OnPropertyChanged(nameof(User));
        OnPropertyChanged(nameof(Name));
        OnPropertyChanged(nameof(Email));
        OnPropertyChanged(nameof(Initials));
        OnPropertyChanged(nameof(ThemeText));
    }

    public async Task LoadStorageAsync()
    {
        try
        {
            var info = await _api.GetStorageAsync();
            var count = info.Images.Count + info.Videos.Count;
            StorageText = $"{count} ảnh/video · {Format.Bytes(info.Total.Bytes)}";
            var health = info.Backend.Provider switch
            {
                "b2" => info.Backend.Healthy ? "Backblaze B2 — hoạt động tốt" : "Backblaze B2 — có vấn đề",
                "kv" => "Workers KV (chuyển tiếp)",
                _ => "Chưa cấu hình storage",
            };
            BackendText = info.Backend.Message is not null ? health + " · " + info.Backend.Message : health;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
        }
        catch
        {
            ErrorText = "Không tải được thông tin dung lượng.";
        }
    }

    private async Task SaveServerAsync()
    {
        var url = ServerUrl.Trim();
        if (url.Length == 0)
        {
            ErrorText = "Nhập địa chỉ máy chủ.";
            return;
        }
        try
        {
            _api.SetServerUrl(url);
            Preferences.Default.Set(SettingsKeys.ServerUrl, _api.ServerUrl);
            ErrorText = null;
        }
        catch
        {
            ErrorText = "Địa chỉ máy chủ không hợp lệ.";
        }
    }

    public async Task SetThemeAsync(string theme)
    {
        try
        {
            await _api.UpdateSettingsAsync(new UserSettings { Theme = theme });
            if (_state.Me is not null) _state.Me.Settings.Theme = theme;
            App.ApplyTheme(theme);
            OnPropertyChanged(nameof(ThemeText));
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
        }
    }

    private async Task LogoutAsync()
    {
        ServiceHelper.Get<GalleryViewModel>().Reset();
        ServiceHelper.Get<AlbumsViewModel>().Reset();
        ServiceHelper.Get<UploadViewModel>().Reset();
        await _state.LogoutAsync();
        Application.Current!.MainPage = new NavigationPage(new Pages.LoginPage());
    }
}
