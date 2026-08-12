namespace AnpMobile;
public partial class RegisterPage : ContentPage
{
    public RegisterPage() => InitializeComponent();
    private async void RegisterClicked(object sender, EventArgs e)
    {
        await DisplayAlert("Register", $"{NameEntry.Text} - {EmailEntry.Text}", "OK");
    }
}
