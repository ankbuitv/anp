namespace AnpMobile.Pages;

public partial class SplashPage : ContentPage
{
    private bool _restored;

    public SplashPage()
    {
        InitializeComponent();
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_restored) return;
        _restored = true;

        var app = (App)Application.Current!;
        bool ok;
        try
        {
            ok = await app.AppState.RestoreSessionAsync();
        }
        catch
        {
            ok = false;
        }
        Application.Current!.MainPage = ok ? new AppShell() : new NavigationPage(new LoginPage());
    }
}
