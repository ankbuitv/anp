using AnpMobile.Core;
using AnpMobile.Services;

namespace AnpMobile.ViewModels;

public sealed class VaultViewModel : ObservableObject
{
    private readonly AppState _state;
    private string _pin = "";
    private string _confirmPin = "";
    private string? _message;

    public string Pin { get => _pin; set => SetProperty(ref _pin, value); }
    public string ConfirmPin { get => _confirmPin; set => SetProperty(ref _confirmPin, value); }
    public string? Message { get => _message; set { if (SetProperty(ref _message, value)) OnPropertyChanged(nameof(HasMessage)); } }
    public bool HasMessage => Message is not null;

    public bool ShowSetPin => !HasPin;
    public bool ShowUnlock => HasPin && !Unlocked;
    public bool ShowUnlocked => HasPin && Unlocked;

    public bool HasPin => _state.HasVaultPin;
    public bool Unlocked => _state.VaultUnlocked;

    public Command SetPinCommand { get; }
    public Command UnlockCommand { get; }
    public Command LockCommand { get; }

    public VaultViewModel(AppState state)
    {
        _state = state;
        _state.Changed += Sync;
        SetPinCommand = new Command(async () => await SetPinAsync());
        UnlockCommand = new Command(async () => await UnlockAsync());
        LockCommand = new Command(async () => await LockAsync());
    }

    public void Sync()
    {
        OnPropertyChanged(nameof(HasPin));
        OnPropertyChanged(nameof(Unlocked));
        OnPropertyChanged(nameof(ShowSetPin));
        OnPropertyChanged(nameof(ShowUnlock));
        OnPropertyChanged(nameof(ShowUnlocked));
    }

    private async Task SetPinAsync()
    {
        var pin = Pin.Trim();
        if (pin.Length != 6 || !pin.All(char.IsDigit))
        {
            Message = "PIN gồm đúng 6 chữ số.";
            return;
        }
        if (pin != ConfirmPin)
        {
            Message = "Nhập lại PIN không khớp.";
            return;
        }
        try
        {
            await _state.SetVaultPinAsync(pin, ConfirmPin);
            Pin = "";
            ConfirmPin = "";
            Message = null;
        }
        catch (ApiException ex)
        {
            Message = ex.Message;
        }
    }

    private async Task UnlockAsync()
    {
        var pin = Pin.Trim();
        if (pin.Length != 6 || !pin.All(char.IsDigit))
        {
            Message = "PIN gồm đúng 6 chữ số.";
            return;
        }
        try
        {
            await _state.UnlockVaultAsync(pin);
            Pin = "";
            Message = null;
        }
        catch (ApiException ex)
        {
            Message = ex.Message;
        }
    }

    private async Task LockAsync()
    {
        try
        {
            await _state.LockVaultAsync();
        }
        catch (ApiException ex)
        {
            Message = ex.Message;
        }
    }
}
