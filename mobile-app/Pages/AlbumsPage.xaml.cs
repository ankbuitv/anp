using AnpMobile.Core;
using AnpMobile.ViewModels;

namespace AnpMobile.Pages;

public partial class AlbumsPage : ContentPage
{
    private readonly AlbumsViewModel _viewModel;

    public AlbumsPage()
    {
        InitializeComponent();
        _viewModel = ServiceHelper.Get<AlbumsViewModel>();
        BindingContext = _viewModel;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _viewModel.LoadAsync();
    }

    private async void TileTapped(object sender, TappedEventArgs e)
    {
        if (sender is not BindableObject bindable || bindable.BindingContext is not AlbumTileViewModel tile) return;
        await Shell.Current.GoToAsync($"album?albumId={Uri.EscapeDataString(tile.Album.Id)}&title={Uri.EscapeDataString(tile.Name)}");
    }

    private async void TileMenuClicked(object sender, EventArgs e)
    {
        if (sender is not BindableObject bindable || bindable.BindingContext is not AlbumTileViewModel tile) return;
        var choice = await DisplayActionSheet(tile.Name, "Hủy", null, "Mở album", "Đổi tên", "Xóa album");
        switch (choice)
        {
            case "Mở album":
                await Shell.Current.GoToAsync($"album?albumId={Uri.EscapeDataString(tile.Album.Id)}&title={Uri.EscapeDataString(tile.Name)}");
                break;
            case "Đổi tên":
                var name = await DisplayPromptAsync("Đổi tên album", "Tên mới:", "Lưu", "Hủy", initialValue: tile.Name);
                if (!string.IsNullOrWhiteSpace(name) && name != tile.Name)
                    await _viewModel.RenameAsync(tile.Album, name.Trim());
                break;
            case "Xóa album":
                var confirm = await DisplayAlert("Xóa album?", "Ảnh/video trong album không bị xóa, chỉ gỡ khỏi album.", "Xóa", "Hủy");
                if (confirm) await _viewModel.DeleteAsync(tile.Album);
                break;
        }
    }

    private async void CreateClicked(object sender, EventArgs e)
    {
        var name = await DisplayPromptAsync("Album mới", "Tên album:", "Tạo", "Hủy");
        if (string.IsNullOrWhiteSpace(name)) return;
        var album = await _viewModel.CreateAsync(name.Trim());
        if (album is not null)
            await Shell.Current.GoToAsync($"album?albumId={Uri.EscapeDataString(album.Id)}&title={Uri.EscapeDataString(album.Name)}");
    }
}
