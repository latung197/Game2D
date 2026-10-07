using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Game.Application.Accounts;
using Microsoft.IdentityModel.Tokens;

namespace Game.Api.Authentication;

public sealed class JwtTokenIssuer(IConfiguration configuration) : IAccessTokenIssuer
{
    public string Issue(Account account)
    {
        var key = configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required.");
        var issuer = configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("Jwt:Issuer is required.");
        var audience = configuration["Jwt:Audience"] ?? throw new InvalidOperationException("Jwt:Audience is required.");
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(issuer, audience,
            [new Claim(JwtRegisteredClaimNames.Sub, account.Id.ToString()), new Claim(JwtRegisteredClaimNames.UniqueName, account.Username)],
            expires: DateTime.UtcNow.AddMinutes(30), signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }
}
