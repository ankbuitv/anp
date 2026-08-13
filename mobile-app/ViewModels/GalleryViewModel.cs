using System.Collections.ObjectModel;
using AnpMobile.Core;
using AnpMobile.Services;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.ViewModels;

public sealed class GalleryViewModel : ObservableObject
{
    private readonly AnpApi _api;
    private readonly ImageCache _cache;

    public ObservableCollection<MediaTileViewModel> Items { get; } = new();

    public string Title { get; private set; } = "ANP";
    public string? AlbumId { get; private set; }
    public bool PrivateOnly { get; private set; }
    public bool IsActive { get; private set; }

    private string? _cursor;
    private bool _hasMore = true;
    private bool _loading;
    private bool _empty = true;
    private bool _selectMode;
    private string _filter = "all";
    private string _search = "";
    private string? _errorText;
    private int _selectedCount;

    public bool IsLoading { get => _loading; set => SetProperty(ref _loading, value); }
    public bool IsEmpty { get => _empty; set => SetProperty(ref _empty, value); }
    public string? ErrorText { get => _errorText; set { if (SetProperty(ref _errorText, value)) OnPropertyChanged(nameof(HasError)); } }
    public bool HasError => ErrorText is not null;

    public string Filter { get => _filter; private set => SetProperty(ref _filter, value); }
    public string SearchText { get => _search; set => SetProperty(ref _search, value); }

    public bool SelectMode
    {
        get => _selectMode;
        set
        {
            if (SetProperty(ref _selectMode, value) && !value) ClearSelection();
        }
    }

    public int SelectedCount
    {
        get => _selectedCount;
        private set => SetProperty(ref _selectedCount, value);
    }

    public Command RefreshCommand { get; }
    public Command SearchCommand { get; }
    public Command LoadMoreCommand { get; }
    public Command BatchFavoriteCommand { get; }
    public Command BatchPrivateCommand { get; }
    public Command BatchDeleteCommand { get; }

    public GalleryViewModel(AnpApi api, ImageCache cache)
    {
        _api = api;
        _cache = cache;
        RefreshCommand = new Command(async () => await ReloadAsync());
        SearchCommand = new Command(async () => await ReloadAsync());
        LoadMoreCommand = new Command(async () => await LoadMoreAsync());
        BatchFavoriteCommand = new Command(async () => await BatchFavoriteAsync(), () => SelectedCount > 0);
        BatchPrivateCommand = new Command(async () => await BatchPrivateAsync(), () => SelectedCount > 0);
        BatchDeleteCommand = new Command(async () => await BatchDeleteAsync(), () => SelectedCount > 0);
    }

    // ---------------- Kích hoạt theo ngữ cảnh (tab chính / album / private vault) ----------------

    public void Activate(string? albumId, bool privateOnly, string? title)
    {
        if (AlbumId == albumId && PrivateOnly == privateOnly)
        {
            if (title is not null && Title != title) Title = title;
            return;
        }
        AlbumId = albumId;
        PrivateOnly = privateOnly;
        Title = title ?? (privateOnly ? "Private Vault" : "ANP");
        IsActive = true;
        _filter = "all";
        _search = "";
        _hasMore = true;
        _cursor = null;
        SelectMode = false;
        MainThread.BeginInvokeOnMainThread(() =>
        {
            Items.Clear();
            ErrorText = null;
            OnPropertyChanged(nameof(Filter));
        });
        _ = LoadMoreAsync();
    }

    public void Reset()
    {
        IsActive = false;
        AlbumId = null;
        PrivateOnly = false;
        Title = "ANP";
        _filter = "all";
        _search = "";
        _cursor = null;
        _hasMore = true;
        SelectMode = false;
        MainThread.BeginInvokeOnMainThread(Items.Clear);
    }

    // ---------------- Nạp dữ liệu ----------------

    public async Task ReloadAsync()
    {
        _cursor = null;
        _hasMore = true;
        MainThread.BeginInvokeOnMainThread(() => { Items.Clear(); ErrorText = null; });
        await LoadMoreAsync();
    }

    public async Task LoadMoreAsync()
    {
        if (_loading || !_hasMore) return;
        _loading = true;
        IsLoading = true;
        try
        {
            List<Media> page;
            string? next;
            if (AlbumId is not null)
            {
                var detail = await _api.GetAlbumAsync(AlbumId);
                page = detail.Items;
                next = null;
            }
            else
            {
                var query = new MediaQuery
                {
                    Type = _filter is "image" or "video" ? _filter : null,
                    Favorite = _filter == "favorite" ? true : null,
                    Search = string.IsNullOrWhiteSpace(_search) ? null : _search,
                    Private = PrivateOnly,
                    Sort = "taken",
                    Cursor = _cursor,
                    Limit = 60,
                };
                var result = await _api.ListMediaAsync(query);
                page = result.Items;
                next = result.NextCursor;
            }
            _cursor = next;
            _hasMore = next is not null;
            MainThread.BeginInvokeOnMainThread(() =>
            {
                foreach (var media in page)
                    Items.Add(new MediaTileViewModel(media, _cache, this));
                IsEmpty = Items.Count == 0;
            });
        }
        catch (Exception ex)
        {
            ErrorText = ex is ApiException apiEx ? apiEx.Message : "Không tải được thư viện. Kiểm tra kết nối.";
        }
        finally
        {
            _loading = false;
            IsLoading = false;
        }
    }

    // ---------------- Bộ lọc ----------------

    public void SetFilter(string filter)
    {
        if (_filter == filter) return;
        _filter = filter;
        OnPropertyChanged(nameof(Filter));
        _ = ReloadAsync();
    }

    // ---------------- Chọn nhiều ----------------

    public void EnterSelectMode(MediaTileViewModel tile)
    {
        SelectMode = true;
        tile.Selected = true;
    }

    public void ToggleSelect(MediaTileViewModel tile)
    {
        tile.Selected = !tile.Selected;
        if (SelectedCount == 0) SelectMode = false;
    }

    public void ClearSelection()
    {
        foreach (var tile in Items) tile.Selected = false;
    }

    internal void NotifySelectionChanged()
    {
        var count = Items.Count(i => i.Selected);
        SelectedCount = count;
        (BatchFavoriteCommand as Command)?.ChangeCanExecute();
        (BatchPrivateCommand as Command)?.ChangeCanExecute();
        (BatchDeleteCommand as Command)?.ChangeCanExecute();
    }

    private List<string> SelectedIds() => Items.Where(i => i.Selected).Select(i => i.Media.Id).ToList();

    private async Task BatchFavoriteAsync()
    {
        var ids = SelectedIds();
        if (ids.Count == 0) return;
        try
        {
            var allFav = ids.All(id => Items.First(i => i.Media.Id == id).Media.IsFavorite);
            await _api.BatchFavoriteAsync(ids, !allFav);
            foreach (var tile in Items.Where(i => i.Selected)) tile.Media.IsFavorite = !allFav;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
        }
        finally
        {
            SelectMode = false;
        }
    }

    private async Task BatchPrivateAsync()
    {
        var ids = SelectedIds();
        if (ids.Count == 0) return;
        try
        {
            var allPriv = ids.All(id => Items.First(i => i.Media.Id == id).Media.IsPrivate);
            var target = !allPriv;
            if (target && ServiceHelper.Get<AppState>() is { VaultUnlocked: false })
            {
                ErrorText = "Mở Private Vault trước khi chuyển vào kho riêng.";
                return;
            }
            await _api.BatchPrivateAsync(ids, target);
            foreach (var tile in Items.Where(i => i.Selected)) tile.Media.IsPrivate = target;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
        }
        finally
        {
            SelectMode = false;
        }
    }

    private async Task BatchDeleteAsync()
    {
        var ids = SelectedIds();
        if (ids.Count == 0) return;
        var tiles = Items.Where(i => i.Selected).ToList();
        try
        {
            await _api.BatchDeleteAsync(ids);
            foreach (var tile in tiles)
            {
                Items.Remove(tile);
                _cache.Invalidate(tile.Media.Id);
            }
            IsEmpty = Items.Count == 0;
        }
        catch (ApiException ex)
        {
            ErrorText = ex.Message;
        }
        finally
        {
            SelectMode = false;
        }
    }

    // ---------------- Cập nhật từ Viewer ----------------

    public void UpdateMedia(Media media)
    {
        var index = -1;
        for (var i = 0; i < Items.Count; i++)
        {
            if (Items[i].Media.Id == media.Id) { index = i; break; }
        }
        if (index >= 0)
        {
            var tile = new MediaTileViewModel(media, _cache, this);
            tile.Selected = false;
            MainThread.BeginInvokeOnMainThread(() => Items[index] = tile);
        }
    }

    public void RemoveMedia(string mediaId)
    {
        var tile = Items.FirstOrDefault(i => i.Media.Id == mediaId);
        if (tile is not null)
        {
            MainThread.BeginInvokeOnMainThread(() => Items.Remove(tile));
            _cache.Invalidate(mediaId);
            IsEmpty = Items.Count == 0;
        }
    }

    public List<Media> MediaSnapshot() => Items.Select(i => i.Media).ToList();
}
