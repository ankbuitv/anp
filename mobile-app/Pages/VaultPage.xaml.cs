using AnpMobile.ViewModels;

namespace AnpMobile.Pages;

public partial class VaultPage : ContentPage
{
    private readonly VaultViewModel _viewModel;

    public VaultPage()
    {
        InitializeComponent();
        _viewModel = ServiceHelper.Get<VaultViewModel>();
        BindingContext = _viewModel;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _viewModel.Sync();
    }

    private async void OpenVaultClicked(object sender, EventArgs e)
    {
        await Shell.Current.GoToAsync("vaultgallery?private=true&title=Private%20Vault");
    }
}
