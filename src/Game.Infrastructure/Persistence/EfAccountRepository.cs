using Game.Application.Accounts;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Game.Infrastructure.Persistence;

public sealed class EfAccountRepository(GameDbContext db) : IAccountRepository
{
    public async Task<Account?> FindByUsernameAsync(string username, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Username == username, cancellationToken);
        return user is null ? null : ToAccount(user);
    }

    public async Task<Account?> FindByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return user is null ? null : ToAccount(user);
    }

    public async Task AddAsync(Account account, CancellationToken cancellationToken)
    {
        db.Users.Add(new UserEntity
        {
            Id = account.Id,
            Username = account.Username,
            PasswordHash = account.PasswordHash,
            CreatedAt = account.CreatedAt
        });
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new DuplicateUsernameException();
        }
    }

    private static Account ToAccount(UserEntity user) => new(user.Id, user.Username, user.PasswordHash, user.CreatedAt);
}
