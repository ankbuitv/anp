using AnpMobile.Core;

namespace AnpMobile.ViewModels;

public sealed class MediaTileViewModel : ObservableObject
{
    private readonly Media _media;
    private readonly ImageCache _cache;
    private readonly GalleryViewModel _owner;

    private string? _thumbPath;
    private bool _loading;
    private bool _selected;

    public Media Media => _media;
    public string? ThumbPath { get => _thumbPath; private set { if (SetProperty(ref _thumbPath, value)) OnPropertyChanged(nameof(ShowPlaceholder)); } }
    public bool Loading { get => _loading; private set => SetProperty(ref _loading, value); }
    public bool ShowPlaceholder => _thumbPath is null && !IsVideo;
    public bool IsVideo => _media.MediaType == MediaType.Video;
    public bool IsFavorite => _media.IsFavorite;
    public bool IsPrivate => _media.IsPrivate;
    public string DurationText => Format.Duration(_media.Duration);

    public bool Selected
    {
        get => _selected;
        set
        {
            if (SetProperty(ref _selected, value)) _owner.NotifySelectionChanged();
        }
    }

    public MediaTileViewModel(Media media, ImageCache cache, GalleryViewModel owner)
    {
        _media = media;
        _cache = cache;
        _owner = owner;
        _ = LoadThumbAsync();
    }

    public async Task LoadThumbAsync()
    {
        try
        {
            Loading = true;
            var path = await _cache.ThumbPathAsync(_media);
            if (path is not null) ThumbPath = path;
        }
        catch
        {
            // ảnh lỗi: hiện placeholder
        }
        finally
        {
            Loading = false;
        }
    }
}
