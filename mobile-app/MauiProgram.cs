using Microsoft.Maui;
using Microsoft.Maui.Hosting;
using Microsoft.Maui.Controls.Hosting;
using Microsoft.Extensions.Logging;

namespace AnpMobile;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();
        builder.Services.AddHttpClient("Worker", client => client.BaseAddress = new Uri("https://p.ankb.qzz.io/api/v1/"));
        return builder.Build();
    }
}
