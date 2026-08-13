using AnpMobile.Pages;

namespace AnpMobile;

public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();

        Routing.RegisterRoute("viewer", typeof(ViewerPage));
        Routing.RegisterRoute("detail", typeof(MediaDetailPage));
        Routing.RegisterRoute("album", typeof(GalleryPage));
        Routing.RegisterRoute("vaultgallery", typeof(GalleryPage));
    }
}
