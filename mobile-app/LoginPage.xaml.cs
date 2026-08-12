namespace AnpMobile;
public partial class LoginPage : ContentPage
{
    public LoginPage() => InitializeComponent();
    private async void LoginClicked(object sender, EventArgs e)
    {
        await DisplayAlert("Login", $"{EmailEntry.Text} - {PasswordEntry.Text}", "OK");
    }
}
