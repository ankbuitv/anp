using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace AnpMobile.Core;

/// <summary>
/// Base INotifyPropertyChanged. Khi chạy trong MAUI, đặt
/// <see cref="UIDispatcher"/> để mọi thay đổi từ luồng nền được đưa về UI thread.
/// </summary>
public abstract class ObservableObject : INotifyPropertyChanged
{
    /// <summary>Marshaller về UI thread (MAUI: MainThread.BeginInvokeOnMainThread).</summary>
    public static Action<Action>? UIDispatcher { get; set; }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        var handler = PropertyChanged;
        if (handler is null) return;
        void Raise() => handler(this, new PropertyChangedEventArgs(name));
        if (UIDispatcher is not null) UIDispatcher(Raise);
        else Raise();
    }

    protected bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        OnPropertyChanged(name);
        return true;
    }
}
