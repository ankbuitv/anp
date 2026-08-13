using AnpMobile.Core;
using AnpMobile.ViewModels;

namespace AnpMobile.Pages;

public partial class UploadPage : ContentPage
{
    private readonly UploadViewModel _viewModel;

    public UploadPage()
    {
        InitializeComponent();
        _viewModel = ServiceHelper.Get<UploadViewModel>();
        BindingContext = _viewModel;
    }

    private void CancelClicked(object sender, EventArgs e)
    {
        if (sender is BindableObject { BindingContext: UploadItem item })
            _viewModel.CancelCommand.Execute(item);
    }

    private void RetryClicked(object sender, EventArgs e)
    {
        if (sender is BindableObject { BindingContext: UploadItem item })
            _viewModel.RetryCommand.Execute(item);
    }
}
