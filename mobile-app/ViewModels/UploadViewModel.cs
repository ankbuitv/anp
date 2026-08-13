using System.Collections.ObjectModel;
using AnpMobile.Core;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Media;

namespace AnpMobile.ViewModels;

public sealed class UploadViewModel : ObservableObject
{
    private readonly UploadEngine _engine;
    private bool _isPrivate;
    private bool _paused;
    private string _statusText = "";
    private string? _message;

    public ObservableCollection<UploadItem> Items { get; } = new();

    public bool IsPrivate { get => _isPrivate; set => SetProperty(ref _isPrivate, value); }
    public bool Paused { get => _paused; private set { if (SetProperty(ref _paused, value)) OnPropertyChanged(nameof(PauseText)); } }
    public string PauseText => Paused ? "Tiếp tục" : "Tạm dừng";
    public string StatusText { get => _statusText; private set => SetProperty(ref _statusText, value); }
    public string? Message { get => _message; set { if (SetProperty(ref _message, value)) OnPropertyChanged(nameof(HasMessage)); } }
    public bool HasMessage => Message is not null;
    public bool IsEmpty => Items.Count == 0;

    public Command PickPhotosCommand { get; }
    public Command PickVideoCommand { get; }
    public Command CaptureCommand { get; }
    public Command PauseResumeCommand { get; }
    public Command ClearCommand { get; }
    public Command CancelCommand { get; }
    public Command RetryCommand { get; }

    public UploadViewModel(UploadEngine engine)
    {
        _engine = engine;
        _engine.Changed += Sync;

        PickPhotosCommand = new Command(async () => await PickPhotosAsync());
        PickVideoCommand = new Command(async () => await PickVideoAsync());
        CaptureCommand = new Command(async () => await CaptureAsync());
        PauseResumeCommand = new Command(() =>
        {
            if (_engine.Paused) _engine.ResumeAll();
            else _engine.PauseAll();
            Paused = _engine.Paused;
        });
        ClearCommand = new Command(() => { _engine.ClearFinished(); Sync(); });
        CancelCommand = new Command<UploadItem>(item => _engine.Cancel(item));
        RetryCommand = new Command<UploadItem>(item => _engine.Retry(item));
        Sync();
    }

    public void Reset()
    {
        _engine.ClearAll();
        Message = null;
        Sync();
    }

    public void Sync()
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            Items.Clear();
            foreach (var item in _engine.Items) Items.Add(item);
            Paused = _engine.Paused;

            var stats = _engine.Stats();
            var active = Items.Count(i => i.Status is UploadStatus.Hashing or UploadStatus.Uploading or UploadStatus.Processing);
            var parts = new List<string>();
            if (active > 0) parts.Add($"{active} đang tải");
            if (stats.Done > 0) parts.Add($"{stats.Done} xong");
            if (stats.Fail > 0) parts.Add($"{stats.Fail} lỗi");
            if (Items.Count(i => i.Status == UploadStatus.Duplicate) > 0)
                parts.Add($"{Items.Count(i => i.Status == UploadStatus.Duplicate)} trùng");
            StatusText = parts.Count > 0 ? string.Join(" · ", parts) : "";
            OnPropertyChanged(nameof(IsEmpty));
        });
    }

    private async Task PickPhotosAsync()
    {
        try
        {
            var results = await MediaPicker.Default.PickMultipleAsync(new MediaPickerOptions
            {
                Title = "Chọn ảnh",
            });
            var accepted = 0;
            foreach (var file in results)
            {
                if (_engine.Enqueue(file.FullPath, file.ContentType ?? "", IsPrivate) is not null) accepted++;
            }
            if (accepted == 0) Message = "Không có ảnh nào được hỗ trợ.";
            else Message = null;
        }
        catch (PermissionException)
        {
            Message = "Chưa cấp quyền truy cập ảnh. Vào Cài đặt hệ thống để cho phép.";
        }
        catch (Exception)
        {
            Message = "Không mở được thư viện ảnh.";
        }
    }

    private async Task PickVideoAsync()
    {
        try
        {
            var file = await MediaPicker.Default.PickVideoAsync(new MediaPickerOptions
            {
                Title = "Chọn video",
            });
            if (file is null) return;
            if (_engine.Enqueue(file.FullPath, file.ContentType ?? "", IsPrivate) is not null) Message = null;
            else Message = "Định dạng video không được hỗ trợ.";
        }
        catch (PermissionException)
        {
            Message = "Chưa cấp quyền truy cập thư viện. Vào Cài đặt hệ thống để cho phép.";
        }
        catch (Exception)
        {
            Message = "Không mở được thư viện.";
        }
    }

    private async Task CaptureAsync()
    {
        try
        {
            var file = await MediaPicker.Default.CapturePhotoAsync(new MediaPickerOptions
            {
                Title = "Chụp ảnh",
            });
            if (file is null) return;
            _engine.Enqueue(file.FullPath, file.ContentType ?? "", IsPrivate);
        }
        catch (PermissionException)
        {
            Message = "Chưa cấp quyền camera.";
        }
        catch (FeatureNotSupportedException)
        {
            Message = "Thiết bị không hỗ trợ chụp ảnh.";
        }
        catch (Exception)
        {
            Message = "Không chụp được ảnh.";
        }
    }
}
