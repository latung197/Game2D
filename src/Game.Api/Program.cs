using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Game.Api.Authentication;
using Game.Application.Accounts;
using Game.Infrastructure.Persistence;
using Game.Application.Abstractions;
using Game.Realtime.Connections;
using Game.Realtime.Hubs;
using Game.Server.Matches;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
var keysPath = builder.Configuration["DataProtection:KeysPath"]
    ?? Path.Combine(builder.Environment.ContentRootPath, ".keys");
Directory.CreateDirectory(keysPath);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keysPath));
var connectionString = builder.Configuration.GetConnectionString("Game")
    ?? throw new InvalidOperationException("ConnectionStrings:Game is required.");
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is required.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key must contain at least 32 UTF-8 bytes.");

builder.Services.AddDbContext<GameDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddScoped<IAccountRepository, EfAccountRepository>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddSingleton<IAccessTokenIssuer, JwtTokenIssuer>();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 4096;
    options.SupportedProtocols = ["messagepack"];
}).AddMessagePackProtocol();
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<IGameEventPublisher, SignalRGameEventPublisher>();
builder.Services.AddSingleton<MatchManager>();
builder.Services.AddSingleton<IMatchCommandGateway>(sp => sp.GetRequiredService<MatchManager>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<MatchManager>());
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            if (context.Request.Path.StartsWithSegments("/hubs/game") &&
                context.Request.Query.TryGetValue("access_token", out var token))
                context.Token = token;
            return Task.CompletedTask;
        }
    };
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Jwt:Audience"],
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(15)
    };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
builder.Services.AddCors(options => options.AddPolicy("Client", policy =>
    policy.WithOrigins(builder.Configuration["Client:Origin"] ?? "http://localhost:5173")
        .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<GameDbContext>().Database.MigrateAsync();
}
app.UseCors("Client");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<GameHub>("/hubs/game");
app.MapPost("/api/auth/register", async (Credentials input, AuthService auth, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Username) || string.IsNullOrEmpty(input.Password))
        return Results.BadRequest(new { error = "Username and password are required." });
    try { return Results.Ok(await auth.RegisterAsync(input.Username, input.Password, ct)); }
    catch (ArgumentException ex) { return Results.BadRequest(new { error = ex.Message }); }
    catch (DuplicateUsernameException) { return Results.Conflict(new { error = "Username already exists." }); }
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", async (Credentials input, AuthService auth, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Username) || string.IsNullOrEmpty(input.Password))
        return Results.BadRequest(new { error = "Username and password are required." });
    var result = await auth.LoginAsync(input.Username, input.Password, ct);
    return result is null ? Results.Unauthorized() : Results.Ok(result);
}).RequireRateLimiting("auth");
app.MapGet("/api/me", async (ClaimsPrincipal principal, IAccountRepository accounts, CancellationToken ct) =>
{
    if (!Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return Results.Unauthorized();
    var account = await accounts.FindByIdAsync(id, ct);
    return account is null ? Results.NotFound() : Results.Ok(new { playerId = account.Id, account.Username });
}).RequireAuthorization();

app.Run();

public sealed record Credentials(string? Username, string? Password);
