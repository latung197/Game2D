using Microsoft.AspNetCore.Identity;

namespace Game.Application.Accounts;

public sealed record Account(Guid Id, string Username, string PasswordHash, DateTimeOffset CreatedAt);
public sealed record AuthResult(Guid PlayerId, string Username, string AccessToken);

public interface IAccountRepository
{
    Task<Account?> FindByUsernameAsync(string username, CancellationToken cancellationToken);
    Task<Account?> FindByIdAsync(Guid id, CancellationToken cancellationToken);
    Task AddAsync(Account account, CancellationToken cancellationToken);
}

public interface IAccessTokenIssuer
{
    string Issue(Account account);
}

public sealed class DuplicateUsernameException : Exception;

public sealed class AuthService(IAccountRepository accounts, IAccessTokenIssuer tokens)
{
    private readonly PasswordHasher<Account> _passwordHasher = new();

    public async Task<AuthResult> RegisterAsync(string username, string password, CancellationToken cancellationToken)
    {
        username = username.Trim().ToLowerInvariant();
        if (username.Length is < 3 or > 24 || !username.All(c => char.IsAsciiLetterOrDigit(c) || c == '_'))
            throw new ArgumentException("Username must have 3–24 ASCII letters, digits or underscores.", nameof(username));
        if (password.Length < 12 || password.Length > 128)
            throw new ArgumentException("Password must have 12–128 characters.", nameof(password));
        if (await accounts.FindByUsernameAsync(username, cancellationToken) is not null)
            throw new DuplicateUsernameException();

        var account = new Account(Guid.NewGuid(), username, string.Empty, DateTimeOffset.UtcNow);
        account = account with { PasswordHash = _passwordHasher.HashPassword(account, password) };
        await accounts.AddAsync(account, cancellationToken);
        return new AuthResult(account.Id, account.Username, tokens.Issue(account));
    }

    public async Task<AuthResult?> LoginAsync(string username, string password, CancellationToken cancellationToken)
    {
        var account = await accounts.FindByUsernameAsync(username.Trim().ToLowerInvariant(), cancellationToken);
        if (account is null || _passwordHasher.VerifyHashedPassword(account, account.PasswordHash, password) == PasswordVerificationResult.Failed)
            return null;
        return new AuthResult(account.Id, account.Username, tokens.Issue(account));
    }
}
