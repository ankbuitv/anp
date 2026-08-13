using AnpMobile.ViewModels;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.Pages;

public partial class GalleryPage : ContentPage, IQueryAttributable
{
    private readonly GalleryViewModel _viewModel;

    // Trang mở qua route "album"/"vaultgallery" nhận tham số từ query.
    private bool _isRoute;
    private string? _routeAlbumId;
    private bool _routePrivate;
    private string? _routeTitle;

    public GalleryPage()
    {
        InitializeComponent();
        _viewModel = ServiceHelper.Get<GalleryViewModel>();
        BindingContext = _viewModel;
        UpdateChips();
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        _isRoute = true;
        _routeAlbumId = query.TryGetValue("albumId", out var album) ? album as string : null;
        _routePrivate = query.TryGetValue("private", out var priv) && bool.TryParse(priv?.ToString(), out var pv) && pv;
        _routeTitle = query.TryGetValue("title", out var t) ? t as string : null;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        if (_isRoute) _viewModel.Activate(_routeAlbumId, _routePrivate, _routeTitle);
        else _viewModel.Activate(null, false, null);
    }

    private async void TileTapped(object sender, TappedEventArgs e)
    {
        if (sender is not BindableObject bindable || bindable.BindingContext is not MediaTileViewModel tile) return;
        if (_viewModel.SelectMode)
        {
            _viewModel.ToggleSelect(tile);
            return;
        }
        var index = _viewModel.Items.IndexOf(tile);
        await Shell.Current.GoToAsync($"viewer?index={index}");
    }

    private void ThresholdReached(object sender, EventArgs e)
    {
        if (_viewModel.SelectMode) return;
        _viewModel.LoadMoreCommand.Execute(null);
    }

    private void ToggleSearchClicked(object sender, EventArgs e)
    {
        Search.IsVisible = !Search.IsVisible;
        if (Search.IsVisible) Search.Focus();
    }

    private void UploadClicked(object sender, EventArgs e)
    {
        _ = Shell.Current.GoToAsync("//UploadPage");
    }

    private void SelectClicked(object sender, EventArgs e)
    {
        _viewModel.SelectMode = !_viewModel.SelectMode;
    }

    private void ChipClicked(object sender, EventArgs e)
    {
        if (sender is not Button chip) return;
        var filter = chip.Text switch
        {
            "Ảnh" => "image",
            "Video" => "video",
            "Yêu thích" => "favorite",
            _ => "all",
        };
        _viewModel.SetFilter(filter);
        UpdateChips();
    }

    private void UpdateChips()
    {
        var selected = _viewModel.Filter;
        StyleChip(ChipAll, selected == "all");
        StyleChip(ChipImage, selected == "image");
        StyleChip(ChipVideo, selected == "video");
        StyleChip(ChipFavorite, selected == "favorite");
    }

    private void StyleChip(Button chip, bool selected)
    {
        chip.Style = (Style)Application.Current!.Resources[selected ? "ButtonChipSelected" : "ButtonChip"];
    }
}
