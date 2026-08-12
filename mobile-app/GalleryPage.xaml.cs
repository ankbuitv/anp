namespace AnpMobile;
public partial class GalleryPage : ContentPage
{
    public GalleryPage() => InitializeComponent();
    protected override void OnAppearing()
    {
        base.OnAppearing();
        BindingContext = new { Items = new[] { "Ảnh 1", "Ảnh 2", "Video 1" } };
    }
}
