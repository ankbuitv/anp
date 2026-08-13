using System.Collections.ObjectModel;
using AnpMobile.Core;
using AnpMobile.Services;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.ViewModels;

public sealed class AlbumTileViewModel : ObservableObject
{
    private readonly Album _album;
    private readonly ImageCache _cache;
    private string? _coverPath;
    private bool _loading;

    public Album Album => _album;
    public string Name => _album.Name;
    public string CountText => $"{_album.MediaCount} mục";
    public string? CoverPath { get => _coverPath; private set => SetProperty(ref _coverPath, value); }
    public bool Loading { get => _loading; private set => SetProperty(ref _loading, value); }
    public bool ShowPlaceholder => _coverPath is null;

    public AlbumTileViewModel(Album album, ImageCache cache)
    {
        _album = album;
        _cache = cache;
        _ = LoadCoverAsync();
    }

    private async Task LoadCoverAsync()
    {
        try
        {
            Loading = true;
            var path = await _cache.AlbumCoverPathAsync(_album);
            if (path is not null) CoverPath = path;
        }
        catch
        {
            // placeholder
        }
        finally
        {
            Loading = false;
        }
    }
}

public sealed class AlbumsViewModel : ObservableObject
{
    private readonly AnpApi _api;
    private readonly ImageCache _cache;

    public ObservableCollection<AlbumTileViewModel> Albums { get; } = new();

    private bool _loading;
    private bool _empty = true;
    private string? _errorText;

    public bool IsLoading { get => _loading; set => SetProperty(ref _loading, value); }
    public bool IsEmpty { get => _empty; set => SetProperty(ref _empty, value); }
    public string? ErrorText { get => _errorText; set { if (SetProperty(ref _errorText, value)) OnPropertyChanged(nameof(HasError)); } }
    public bool HasError => ErrorText is not null;

    public Command RefreshCommand { get; }

    public AlbumsViewModel(AnpApi api, ImageCache cache)
    {
        _api = api;
        _cache = cache;
        RefreshCommand = new Command(async () => await LoadAsync());
    }

    public async Task LoadAsync()
    {
        if (_loading) return;
        _loading = true;
        IsLoading = true;
        try
        {
            var list = await _api.ListAlbumsAsync();
            MainThread.BeginInvokeOnMainThread(() =>
            {
                Albums.Clear();
                foreach (var album in list.Items) Albums.Add(new AlbumTileViewModel(album, _cache));
                IsEmpty = Albums.Count == 0;
            });
        }
        catch (Exception ex)
        {
            ErrorText = ex is ApiException apiEx ? apiEx.Message : "Không tải được album.";
        }
        finally
        {
            _loading = false;
            IsLoading = false;
        }
    }

    public async Task<Album?> CreateAsync(string name)
    {
        try
        {
            var album = await _api.CreateAlbumAsync(name, null, false);
            MainThread.BeginInvokeOnMainThread(() => Albums.Insert(0, new AlbumTileViewModel(album, _cache)));
            IsEmpty = false;
            return album;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
            return null;
        }
    }

    public async Task<bool> RenameAsync(Album album, string newName)
    {
        try
        {
            var updated = await _api.UpdateAlbumAsync(album.Id, new AlbumPatch { Name = newName });
            var tile = Albums.FirstOrDefault(a => a.Album.Id == album.Id);
            if (tile is not null)
            {
                var index = Albums.IndexOf(tile);
                MainThread.BeginInvokeOnMainThread(() => Albums[index] = new AlbumTileViewModel(updated, _cache));
            }
            return true;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
            return false;
        }
    }

    public async Task<bool> DeleteAsync(Album album)
    {
        try
        {
            await _api.DeleteAlbumAsync(album.Id);
            var tile = Albums.FirstOrDefault(a => a.Album.Id == album.Id);
            if (tile is not null) MainThread.BeginInvokeOnMainThread(() => Albums.Remove(tile));
            IsEmpty = Albums.Count == 0;
            return true;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
            return false;
        }
    }

    public void Reset()
    {
        MainThread.BeginInvokeOnMainThread(() => { Albums.Clear(); IsEmpty = true; ErrorText = null; });
    }
}
