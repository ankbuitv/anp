using AnpMobile.Core;
using AnpMobile.Pages;
using AnpMobile.Services;
using AnpMobile.ViewModels;
using CommunityToolkit.Maui;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Storage;

namespace AnpMobile;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .UseMauiCommunityToolkitMediaElement()
            .ConfigureFonts(fonts =>
            {
                // Dùng font mặc định của hệ thống.
            });

        var serverUrl = Preferences.Default.Get(SettingsKeys.ServerUrl, AnpApi.ProductionUrl);

        // Core
        builder.Services.AddSingleton<ISessionStore, SecureSessionStore>();
        builder.Services.AddSingleton(sp => new AnpApi(serverUrl, sp.GetRequiredService<ISessionStore>()));
        builder.Services.AddSingleton(sp => new UploadEngine(
            sp.GetRequiredService<AnpApi>(),
            ThumbnailService.MakeJpegThumb));

        // Dịch vụ app
        builder.Services.AddSingleton<AppState>();
        builder.Services.AddSingleton<ImageCache>();

        // ViewModels
        builder.Services.AddSingleton<GalleryViewModel>();
        builder.Services.AddSingleton<AlbumsViewModel>();
        builder.Services.AddSingleton<UploadViewModel>();
        builder.Services.AddSingleton<VaultViewModel>();
        builder.Services.AddSingleton<SettingsViewModel>();

        // Pages
        builder.Services.AddTransient<LoginPage>();
        builder.Services.AddTransient<RegisterPage>();
        builder.Services.AddTransient<GalleryPage>();
        builder.Services.AddTransient<ViewerPage>();
        builder.Services.AddTransient<MediaDetailPage>();
        builder.Services.AddTransient<AlbumsPage>();
        builder.Services.AddTransient<UploadPage>();
        builder.Services.AddTransient<VaultPage>();
        builder.Services.AddTransient<SettingsPage>();

        var app = builder.Build();
        ServiceHelper.Initialize(app.Services);
        ObservableObject.UIDispatcher = action => MainThread.BeginInvokeOnMainThread(action);
        return app;
    }
}
