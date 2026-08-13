using AnpMobile.Core;
using AnpMobile.Services;
using Microsoft.Maui.ApplicationModel;

namespace AnpMobile.Controls;

/// <summary>
/// Một "trang" trong viewer: ảnh (preview, pinch-zoom) hoặc video (phát từ file cache).
/// Nội dung được dựng bằng code để dễ điều khiển vòng đời tải async.
/// </summary>
public sealed class MediaSlide : ContentView
{
    public static readonly BindableProperty MediaProperty = BindableProperty.Create(
        nameof(Media), typeof(Media), typeof(MediaSlide), null,
        propertyChanged: (bindable, _, newValue) => ((MediaSlide)bindable).OnMediaChanged((Media?)newValue));

    public Media? Media
    {
        get => (Media?)GetValue(MediaProperty);
        set => SetValue(MediaProperty, value);
    }

    private readonly Grid _root = new();
    private readonly Image _image = new()
    {
        Aspect = Aspect.AspectFit,
        BackgroundColor = Colors.Black,
    };
    private readonly MediaElement _video = new()
    {
        BackgroundColor = Colors.Black,
        ShouldShowPlaybackControls = true,
        ShouldAutoPlay = false,
    };
    private readonly ActivityIndicator _spinner = new()
    {
        Color = Color.FromArgb("#D7A36A"),
        IsRunning = false,
        WidthRequest = 36,
        HeightRequest = 36,
        HorizontalOptions = LayoutOptions.Center,
        VerticalOptions = LayoutOptions.Center,
    };
    private readonly Label _progress = new()
    {
        TextColor = Colors.White,
        FontSize = 13,
        HorizontalOptions = LayoutOptions.Center,
        VerticalOptions = LayoutOptions.End,
        Margin = new Thickness(0, 0, 0, 96),
    };
    private readonly Label _play = new()
    {
        Text = "▶",
        FontSize = 68,
        TextColor = Colors.White,
        HorizontalOptions = LayoutOptions.Center,
        VerticalOptions = LayoutOptions.Center,
    };
    private readonly Label _error = new()
    {
        Text = "Không tải được nội dung.",
        TextColor = Colors.White,
        FontSize = 13,
        HorizontalOptions = LayoutOptions.Center,
        VerticalOptions = LayoutOptions.Center,
        IsVisible = false,
    };

    private CancellationTokenSource? _cts;
    private double _startScale = 1;

    public MediaSlide()
    {
        _video.IsVisible = false;
        _play.IsVisible = false;

        _root.Children.Add(_image);
        _root.Children.Add(_video);
        _root.Children.Add(_error);
        _root.Children.Add(_spinner);
        _root.Children.Add(_progress);
        _root.Children.Add(_play);

        var pinch = new PinchGestureRecognizer();
        pinch.PinchUpdated += OnPinchUpdated;
        _image.GestureRecognizers.Add(pinch);

        var doubleTap = new TapGestureRecognizer { NumberOfTapsRequired = 2 };
        doubleTap.Tapped += (_, _) =>
        {
            _image.ScaleTo(_image.Scale > 1.1 ? 1 : 2.5, 180, Easing.CubicOut);
        };
        _image.GestureRecognizers.Add(doubleTap);

        var playTap = new TapGestureRecognizer();
        playTap.Tapped += (_, _) => _video.Play();
        _play.GestureRecognizers.Add(playTap);

        Content = _root;
    }

    private void OnPinchUpdated(object? sender, PinchGestureUpdatedEventArgs e)
    {
        if (e.Status == GestureStatus.Started)
        {
            _startScale = _image.Scale;
        }
        else if (e.Status == GestureStatus.Running)
        {
            _image.Scale = Math.Clamp(_startScale * e.Scale, 1, 5);
        }
    }

    private void OnMediaChanged(Media? media)
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        var ct = _cts.Token;

        _image.Scale = 1;
        _image.Source = null;
        _video.Source = null;
        _video.IsVisible = false;
        _play.IsVisible = false;
        _error.IsVisible = false;
        _progress.Text = "";
        _spinner.IsVisible = false;
        _spinner.IsRunning = false;

        if (media is null) return;

        _spinner.IsVisible = true;
        _spinner.IsRunning = true;
        if (media.MediaType == MediaType.Video)
        {
            _video.IsVisible = true;
            _ = LoadVideoAsync(media, ct);
        }
        else
        {
            _ = LoadImageAsync(media, ct);
        }
    }

    private async Task LoadImageAsync(Media media, CancellationToken ct)
    {
        try
        {
            var cache = ServiceHelper.Get<ImageCache>();
            var progress = new Progress<double>(p =>
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    if (p < 1) _progress.Text = $"Đang tải… {p:P0}";
                    else _progress.Text = "";
                }));
            var path = media.HasPreview
                ? await cache.PreviewPathAsync(media, progress, ct)
                : await cache.FilePathAsync(media, progress, ct);
            if (ct.IsCancellationRequested || path is null)
            {
                if (path is null && !ct.IsCancellationRequested) ShowError();
                return;
            }
            MainThread.BeginInvokeOnMainThread(() =>
            {
                _image.Source = ImageSource.FromFile(path);
                _progress.Text = "";
            });
        }
        catch
        {
            if (!ct.IsCancellationRequested) ShowError();
        }
        finally
        {
            MainThread.BeginInvokeOnMainThread(StopSpinner);
        }
    }

    private async Task LoadVideoAsync(Media media, CancellationToken ct)
    {
        try
        {
            var cache = ServiceHelper.Get<ImageCache>();
            var progress = new Progress<double>(p =>
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    if (p < 1) _progress.Text = $"Đang tải video… {p:P0}";
                    else _progress.Text = "";
                }));
            var path = await cache.FilePathAsync(media, progress, ct);
            if (ct.IsCancellationRequested || path is null)
            {
                if (path is null && !ct.IsCancellationRequested) ShowError();
                return;
            }
            MainThread.BeginInvokeOnMainThread(() =>
            {
                _video.Source = path;
                _play.IsVisible = true;
                _progress.Text = "";
            });
        }
        catch
        {
            if (!ct.IsCancellationRequested) ShowError();
        }
        finally
        {
            MainThread.BeginInvokeOnMainThread(StopSpinner);
        }
    }

    private void ShowError() => MainThread.BeginInvokeOnMainThread(() =>
    {
        _error.IsVisible = true;
        _progress.Text = "";
    });

    private void StopSpinner()
    {
        _spinner.IsVisible = false;
        _spinner.IsRunning = false;
    }
}
