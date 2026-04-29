using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using NotarisationHedera.API.Data;
using NotarisationHedera.API.Models;
using NotarisationHedera.API.Models.DTOs;

namespace NotarisationHedera.API.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly ICryptoService _crypto;
    private readonly IConfiguration _config;

    public AuthService(AppDbContext db, IMemoryCache cache, ICryptoService crypto, IConfiguration config)
    {
        _db = db;
        _cache = cache;
        _crypto = crypto;
        _config = config;
    }

    public async Task<User?> RegisterAsync(RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.HederaAccountId == request.HederaAccountId))
            return null;

        var user = new User
        {
            Username = request.Username,
            Email = request.Email,
            HederaAccountId = request.HederaAccountId,
            PublicKeyHex = request.PublicKeyHex.ToLowerInvariant()
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    public Task<ChallengeResponse> GenerateChallengeAsync(string hederaAccountId)
    {
        var nonce = _crypto.GenerateNonce();
        var expiresAt = DateTime.UtcNow.AddMinutes(5);

        var challenge = new AuthChallenge
        {
            Nonce = nonce,
            HederaAccountId = hederaAccountId,
            ExpiresAt = expiresAt
        };

        // Cache the challenge keyed by nonce; auto-evict after TTL
        _cache.Set($"challenge:{nonce}", challenge, expiresAt);

        return Task.FromResult(new ChallengeResponse(
            Nonce: nonce,
            Message: $"Sign this nonce to authenticate: {nonce}",
            ExpiresAt: expiresAt
        ));
    }

    public async Task<LoginResponse?> LoginAsync(LoginRequest request)
    {
        if (!_cache.TryGetValue($"challenge:{request.Nonce}", out AuthChallenge? challenge))
            return null;

        if (challenge is null || challenge.IsExpired() || challenge.HederaAccountId != request.HederaAccountId)
            return null;

        // Remove challenge to prevent replay attacks
        _cache.Remove($"challenge:{request.Nonce}");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.HederaAccountId == request.HederaAccountId);
        if (user is null) return null;

        // Verify the ED25519 signature over the nonce bytes
        var nonceBytes = Encoding.UTF8.GetBytes(request.Nonce);
        if (!_crypto.VerifyEd25519Signature(nonceBytes, request.SignatureHex, user.PublicKeyHex))
            return null;

        var expiry = DateTime.UtcNow.AddMinutes(int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60"));
        return new LoginResponse(
            Token: GenerateJwt(user),
            Username: user.Username,
            HederaAccountId: user.HederaAccountId,
            ExpiresAt: expiry
        );
    }

    public string GenerateJwt(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim("hedera_account", user.HederaAccountId),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiry),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
