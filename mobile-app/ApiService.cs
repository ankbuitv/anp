namespace AnpMobile;

public class ApiService
{
    private readonly HttpClient _http;
    public ApiService(IHttpClientFactory factory) => _http = factory.CreateClient("Worker");

    public Task<string> LoginAsync(string email, string password) =>
        _http.PostAsJsonAsync("auth/login", new { email, password }).ContinueWith(t => t.Result.Content.ReadAsStringAsync().Result);
}
