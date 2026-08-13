using System.Collections.ObjectModel;
using AnpMobile.Core;
using AnpMobile.Services;
using AnpMobile.ViewModels;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.Pages;

public partial class ViewerPage : ContentPage, IQueryAttributable
{
    private readonly GalleryViewModel _gallery;
    private readonly AnpApi _api;
    private readonly ImageCache _cache;
    private readonly AppState _appState;
    private Media? _current;
    private int _startIndex;
    private bool _loaded;

    public ObservableCollection<Media> MediaItems { get; } = new();

    public ViewerPage()
    {
        InitializeComponent();
        BindingContext = this;
        _gallery = ServiceHelper.Get<GalleryViewModel>();
        _api = ServiceHelper.Get<AnpApi>();
        _cache = ServiceHelper.Get<ImageCache>();
        _appState = ServiceHelper.Get<AppState>();
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("index", out var index) && int.TryParse(index?.ToString(), out var parsed))
            _startIndex = Math.Max(0, parsed);
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        if (_loaded) return;
        _loaded = true;

        MainThread.BeginInvokeOnMainThread(() =>
        {
            MediaItems.Clear();
            foreach (var media in _gallery.MediaSnapshot()) MediaItems.Add(media);
            Carousel.Position = Math.Min(_startIndex, Math.Max(0, MediaItems.Count - 1));
        });
        UpdateOverlay();
    }

    private void CarouselCurrentItemChanged(object? sender, CurrentItemChangedEventArgs e)
    {
        _current = e.CurrentItem as Media;
        UpdateOverlay();
    }

    private void UpdateOverlay()
    {
        var media = _current ?? (Carousel.CurrentItem as Media);
        if (media is null) return;
        TitleLabel.Text = string.IsNullOrWhiteSpace(media.OriginalName) ? media.Filename : media.OriginalName;
        CountLabel.Text = $"{Carousel.Position + 1}/{MediaItems.Count}";
        FavButton.Text = media.IsFavorite ? "★" : "☆";
        PrivateButton.Text = media.IsPrivate ? "Ra khỏi Kho" : "Vào Kho";
        PrivateBadge.IsVisible = media.IsPrivate;
    }

    private async void CloseClicked(object sender, EventArgs e) => await Shell.Current.GoToAsync("..");

    private async void InfoClicked(object sender, EventArgs e)
    {
        if (_current is null) return;
        await Shell.Current.GoToAsync($"detail?id={_current.Id}");
    }

    private async void FavClicked(object sender, EventArgs e)
    {
        var media = _current;
        if (media is null) return;
        try
        {
            var result = await _api.PatchMediaAsync(media.Id, new MediaPatch { IsFavorite = !media.IsFavorite });
            if (result.Media is not null)
            {
                media.IsFavorite = result.Media.IsFavorite;
                _gallery.UpdateMedia(media);
                UpdateOverlay();
            }
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không lưu được", ex.Message, "OK");
        }
    }

    private async void PrivateClicked(object sender, EventArgs e)
    {
        var media = _current;
        if (media is null) return;
        var target = !media.IsPrivate;
        if (target && !_appState.VaultUnlocked)
        {
            await DisplayAlert("Private Vault đang khóa", "Mở Vault ở tab Vault rồi thử lại.", "OK");
            return;
        }
        try
        {
            await _api.BatchPrivateAsync(new[] { media.Id }, target);
            media.IsPrivate = target;
            _gallery.UpdateMedia(media);
            UpdateOverlay();
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không lưu được", ex.Message, "OK");
        }
    }

    private async void SaveClicked(object sender, EventArgs e)
    {
        var media = _current;
        if (media is null) return;
        try
        {
            await DownloadAndAsync(media, "Đang lưu về máy…", async path =>
            {
                var saved = MediaLibraryService.SaveToLibrary(path, media.Mime);
                if (saved is null)
                {
                    await DisplayAlert("Không lưu được", "Không ghi được vào thư viện ảnh của máy.", "OK");
                }
                else
                {
                    await DisplayAlert("Đã lưu", "File đã được lưu vào thư viện ảnh của máy.", "OK");
                }
            });
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không lưu được", ex.Message, "OK");
        }
    }

    private async void DeleteClicked(object sender, EventArgs e)
    {
        var media = _current;
        if (media is null) return;
        var confirm = await DisplayAlert("Xóa?", "Ảnh/video sẽ chuyển vào thùng rác 30 ngày trước khi xóa vĩnh viễn.", "Xóa", "Hủy");
        if (!confirm) return;
        try
        {
            await _api.BatchDeleteAsync(new[] { media.Id });
            _gallery.RemoveMedia(media.Id);
            MediaItems.Remove(media);
            if (MediaItems.Count == 0)
            {
                await Shell.Current.GoToAsync("..");
                return;
            }
            UpdateOverlay();
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không xóa được", ex.Message, "OK");
        }
    }

    private async Task DownloadAndAsync(Media media, string busyText, Func<string, Task> then)
    {
        BusyOverlay.IsVisible = true;
        BusySpinner.IsRunning = true;
        BusyLabel.Text = busyText;
        try
        {
            var progress = new Progress<double>(p =>
                MainThread.BeginInvokeOnMainThread(() =>
                    BusyLabel.Text = $"{busyText} {p:P0}"));
            var path = await _cache.FilePathAsync(media, progress);
            if (path is null)
            {
                await DisplayAlert("Không tải được", "Không tải được file. Kiểm tra kết nối.", "OK");
                return;
            }
            await then(path);
        }
        finally
        {
            BusyOverlay.IsVisible = false;
            BusySpinner.IsRunning = false;
        }
    }
}
