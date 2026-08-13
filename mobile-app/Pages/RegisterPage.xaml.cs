using AnpMobile.Core;
using AnpMobile.Services;

namespace AnpMobile.Pages;

public partial class RegisterPage : ContentPage
{
    private readonly AppState _appState;

    public RegisterPage()
    {
        InitializeComponent();
        _appState = ServiceHelper.Get<AppState>();
    }

    private async void RegisterClicked(object sender, EventArgs e)
    {
        var name = NameEntry.Text?.Trim() ?? "";
        var email = EmailEntry.Text?.Trim() ?? "";
        var password = PasswordEntry.Text ?? "";
        var confirm = ConfirmEntry.Text ?? "";

        if (name.Length == 0 || email.Length == 0 || password.Length == 0)
        {
            ShowError("Nhập đầy đủ tên, email và mật khẩu.");
            return;
        }
        if (password != confirm)
        {
            ShowError("Xác nhận mật khẩu không khớp.");
            return;
        }
        if (password.Length < 8 || !password.Any(char.IsLetter) || !password.Any(char.IsDigit))
        {
            ShowError("Mật khẩu cần ít nhất 8 ký tự, có chữ và số.");
            return;
        }

        RegisterButton.IsEnabled = false;
        try
        {
            await _appState.RegisterAsync(name, email, password, confirm);
            Application.Current!.MainPage = new AppShell();
        }
        catch (ApiException ex)
        {
            ShowError(ex.Message);
        }
        catch
        {
            ShowError("Không kết nối được máy chủ. Kiểm tra mạng.");
        }
        finally
        {
            RegisterButton.IsEnabled = true;
        }
    }

    private void ShowError(string message)
    {
        ErrorLabel.Text = message;
        ErrorLabel.IsVisible = true;
    }
}
