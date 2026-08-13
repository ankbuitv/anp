using AnpMobile.Core;
using AnpMobile.Services;

namespace AnpMobile.Pages;

public partial class LoginPage : ContentPage
{
    private readonly AppState _appState;

    public LoginPage()
    {
        InitializeComponent();
        _appState = ServiceHelper.Get<AppState>();
        ServerLabel.Text = "Máy chủ: " + ServiceHelper.Get<AnpApi>().ServerUrl;
    }

    private async void LoginClicked(object sender, EventArgs e)
    {
        var email = EmailEntry.Text?.Trim() ?? "";
        var password = PasswordEntry.Text ?? "";
        if (email.Length == 0 || password.Length == 0)
        {
            ShowError("Nhập email và mật khẩu.");
            return;
        }

        SetBusy(true);
        try
        {
            await _appState.LoginAsync(email, password);
            Application.Current!.MainPage = new AppShell();
        }
        catch (ApiException ex)
        {
            ShowError(ex.Message);
        }
        catch
        {
            ShowError("Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ máy chủ trong Cài đặt.");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void RegisterClicked(object sender, EventArgs e)
    {
        await Navigation.PushAsync(new RegisterPage());
    }

    private void ShowError(string message)
    {
        ErrorLabel.Text = message;
        ErrorLabel.IsVisible = true;
    }

    private void SetBusy(bool busy)
    {
        Busy.IsVisible = busy;
        Busy.IsRunning = busy;
        EmailEntry.IsEnabled = !busy;
        PasswordEntry.IsEnabled = !busy;
    }
}
