using AnpMobile.Pages;
using AnpMobile.Services;

namespace AnpMobile;

public partial class App : Application
{
    public AppState AppState { get; }

    public App(AppState appState)
    {
        InitializeComponent();
        AppState = appState;
        MainPage = new SplashPage();
    }

    /// <summary>Áp theme người dùng (dark/light/system) lên toàn app.</summary>
    public static void ApplyTheme(string? theme)
    {
        Current!.UserAppTheme = theme switch
        {
            "light" => AppTheme.Light,
            "dark" => AppTheme.Dark,
            _ => AppTheme.Unspecified,
        };
    }
}
