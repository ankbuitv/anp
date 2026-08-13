using Microsoft.Extensions.DependencyInjection;

namespace AnpMobile;

/// <summary>
/// Shell tạo page bằng constructor không tham số nên không inject qua DI được —
/// các page lấy service thông qua helper này (khởi tạo trong MauiProgram).
/// </summary>
public static class ServiceHelper
{
    public static IServiceProvider Services { get; private set; } = null!;

    public static void Initialize(IServiceProvider services) => Services = services;

    public static T Get<T>() where T : notnull => Services.GetRequiredService<T>();
}
