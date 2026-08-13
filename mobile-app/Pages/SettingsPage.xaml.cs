using AnpMobile.ViewModels;

namespace AnpMobile.Pages;

public partial class SettingsPage : ContentPage
{
    private readonly SettingsViewModel _viewModel;

    public SettingsPage()
    {
        InitializeComponent();
        _viewModel = ServiceHelper.Get<SettingsViewModel>();
        BindingContext = _viewModel;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        _viewModel.Sync();
        await _viewModel.LoadStorageAsync();
        UpdateThemeChips();
    }

    private async void ThemeClicked(object sender, EventArgs e)
    {
        if (sender is not Button button) return;
        var theme = button.Text switch
        {
            "Sáng" => "light",
            "Tối" => "dark",
            _ => "system",
        };
        await _viewModel.SetThemeAsync(theme);
        UpdateThemeChips();
    }

    private void UpdateThemeChips()
    {
        var current = _viewModel.ThemeText;
        StyleChip(ThemeSystem, current == "Hệ thống");
        StyleChip(ThemeDark, current == "Tối");
        StyleChip(ThemeLight, current == "Sáng");
    }

    private void StyleChip(Button chip, bool selected)
    {
        chip.Style = (Style)Application.Current!.Resources[selected ? "ButtonChipSelected" : "ButtonChip"];
    }
}
