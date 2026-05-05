using NotarisationHedera.API.Models;
using NotarisationHedera.API.Models.DTOs;

namespace NotarisationHedera.API.Services;

public interface IAuthService
{
    Task<(User? User, string? Error)> RegisterAsync(RegisterRequest request);
    Task<ChallengeResponse> GenerateChallengeAsync(string hederaAccountId);
    Task<LoginResponse?> LoginAsync(LoginRequest request);
    string GenerateJwt(User user);
}
