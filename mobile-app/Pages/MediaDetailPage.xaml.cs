using AnpMobile.Core;
using AnpMobile.Services;
using AnpMobile.ViewModels;
using Microsoft.Maui.ApplicationModel.DataTransfer;

namespace AnpMobile.Pages;

public partial class MediaDetailPage : ContentPage, IQueryAttributable
{
    private readonly AnpApi _api;
    private readonly ImageCache _cache;
    private string _mediaId = "";
    private Media? _media;
    private bool _loaded;

    public MediaDetailPage()
    {
        InitializeComponent();
        _api = ServiceHelper.Get<AnpApi>();
        _cache = ServiceHelper.Get<ImageCache>();
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("id", out var id)) _mediaId = id?.ToString() ?? "";
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_loaded || _mediaId.Length == 0) return;
        _loaded = true;
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        try
        {
            _media = await _api.GetMediaAsync(_mediaId);
            if (_media is null) return;
            NameLabel.Text = string.IsNullOrWhiteSpace(_media.OriginalName) ? _media.Filename : _media.OriginalName;
            SizeLabel.Text = $"{Format.Bytes(_media.Size)} · {_media.Width}×{_media.Height}";
            DateLabel.Text = _media.TakenAt is not null
                ? "Chụp " + Format.DateTimeStr(_media.TakenAt.Value)
                : "Tải lên " + Format.DateTimeStr(_media.UploadedAt);

            var info = new List<string>();
            info.Add(_media.MediaType == MediaType.Video ? "Video" : "Ảnh");
            info.Add(_media.Mime);
            if (_media.MediaType == MediaType.Video) info.Add(Format.Duration(_media.Duration));
            InfoLabel.Text = string.Join(" · ", info);

            var camera = new List<string>();
            if (!string.IsNullOrWhiteSpace(_media.CameraMake) || !string.IsNullOrWhiteSpace(_media.CameraModel))
                camera.Add(string.Join(" ", new[] { _media.CameraMake, _media.CameraModel }.Where(s => !string.IsNullOrWhiteSpace(s))));
            if (!string.IsNullOrWhiteSpace(_media.Lens)) camera.Add(_media.Lens);
            CameraLabel.Text = camera.Count > 0 ? string.Join(" + ", camera) : "Không có dữ liệu";
            CameraLabel.IsVisible = camera.Count > 0;

            var exif = new List<string>();
            if (_media.Iso is not null) exif.Add($"ISO {_media.Iso}");
            if (!string.IsNullOrWhiteSpace(_media.Aperture)) exif.Add(_media.Aperture);
            if (!string.IsNullOrWhiteSpace(_media.ShutterSpeed)) exif.Add(_media.ShutterSpeed);
            if (!string.IsNullOrWhiteSpace(_media.FocalLength)) exif.Add(_media.FocalLength);
            if (_media.Orientation is not null) exif.Add($"Xoay {_media.Orientation}°");
            ExifLabel.Text = exif.Count > 0 ? string.Join(" · ", exif) : "Không có dữ liệu EXIF";
            ExifLabel.IsVisible = exif.Count > 0;

            var location = _media.LocationName ?? "";
            if (_media.Lat is not null && _media.Lng is not null)
                location += (location.Length > 0 ? " — " : "") + $"{_media.Lat:F5}, {_media.Lng:F5}";
            LocationLabel.Text = location.Length > 0 ? location : "Không có vị trí";
            LocationLabel.IsVisible = location.Length > 0;

            AlbumsLabel.Text = _media.Albums.Count > 0
                ? string.Join(", ", _media.Albums.Select(a => a.Name))
                : "Chưa ở album nào";
            ChecksumLabel.Text = "SHA-256 " + _media.Checksum;

            var thumbPath = await _cache.ThumbPathAsync(_media);
            if (thumbPath is not null) ThumbImage.Source = ImageSource.FromFile(thumbPath);
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không tải được", ex.Message, "OK");
        }
    }

    private async void AddToAlbumClicked(object sender, EventArgs e)
    {
        var media = _media;
        if (media is null) return;
        try
        {
            var albums = await _api.ListAlbumsAsync();
            var options = albums.Items.Select(a => a.Name).ToList();
            options.Add("＋ Tạo album mới");
            var choice = await DisplayActionSheet("Thêm vào album", "Hủy", null, options.ToArray());
            if (choice is null or "Hủy") return;

            string? albumId = null;
            if (choice == "＋ Tạo album mới")
            {
                var name = await DisplayPromptAsync("Album mới", "Tên album:", "Tạo", "Hủy");
                if (string.IsNullOrWhiteSpace(name)) return;
                var created = await _api.CreateAlbumAsync(name.Trim(), null, false);
                albumId = created.Id;
            }
            else
            {
                albumId = albums.Items.FirstOrDefault(a => a.Name == choice)?.Id;
            }
            if (albumId is null) return;

            await _api.AddAlbumItemsAsync(albumId, new[] { media.Id });
            await DisplayAlert("Xong", "Đã thêm vào album.", "OK");
            await LoadAsync();
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không thêm được", ex.Message, "OK");
        }
    }

    private async void SaveClicked(object sender, EventArgs e)
    {
        var media = _media;
        if (media is null) return;
        try
        {
            var path = await _cache.FilePathAsync(media);
            if (path is null)
            {
                await DisplayAlert("Không tải được", "Không tải được file. Kiểm tra kết nối.", "OK");
                return;
            }
            var saved = MediaLibraryService.SaveToLibrary(path, media.Mime);
            await DisplayAlert(saved is null ? "Không lưu được" : "Đã lưu",
                saved is null ? "Không ghi được vào thư viện ảnh của máy." : "File đã được lưu vào thư viện ảnh của máy.", "OK");
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không tải được", ex.Message, "OK");
        }
    }

    private async void ShareClicked(object sender, EventArgs e)
    {
        var media = _media;
        if (media is null) return;
        try
        {
            var path = await _cache.FilePathAsync(media);
            if (path is null)
            {
                await DisplayAlert("Không tải được", "Không tải được file. Kiểm tra kết nối.", "OK");
                return;
            }
            await Share.Default.RequestAsync(new ShareFileRequest
            {
                Title = string.IsNullOrWhiteSpace(media.OriginalName) ? media.Filename : media.OriginalName,
                File = new ShareFile(path, media.Mime),
            });
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không tải được", ex.Message, "OK");
        }
    }

    private async void DeleteClicked(object sender, EventArgs e)
    {
        var media = _media;
        if (media is null) return;
        var confirm = await DisplayAlert("Xóa?", "Ảnh/video sẽ chuyển vào thùng rác 30 ngày trước khi xóa vĩnh viễn.", "Xóa", "Hủy");
        if (!confirm) return;
        try
        {
            await _api.BatchDeleteAsync(new[] { media.Id });
            ServiceHelper.Get<GalleryViewModel>().RemoveMedia(media.Id);
            await Shell.Current.GoToAsync("..");
        }
        catch (ApiException ex)
        {
            await DisplayAlert("Không xóa được", ex.Message, "OK");
        }
    }
}
