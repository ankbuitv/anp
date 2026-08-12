namespace AnpMobile;

public partial class MainPage : ContentPage
{
    public MainPage() => InitializeComponent();

    private async void LoginClicked(object sender, EventArgs e) => await Navigation.PushAsync(new LoginPage());
    private async void RegisterClicked(object sender, EventArgs e) => await Navigation.PushAsync(new RegisterPage());
    private async void GalleryClicked(object sender, EventArgs e) => await Navigation.PushAsync(new GalleryPage());
}
