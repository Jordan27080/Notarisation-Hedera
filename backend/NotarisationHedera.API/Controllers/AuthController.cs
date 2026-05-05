using Microsoft.AspNetCore.Mvc;
using NotarisationHedera.API.Models.DTOs;
using NotarisationHedera.API.Services;

namespace NotarisationHedera.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(IAuthService authService) : ControllerBase
{
    [HttpPost("register")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var (user, error) = await authService.RegisterAsync(request);

        if (user is null)
        {
            // Conflict = compte déjà existant, BadRequest = clé invalide
            bool isConflict = error?.Contains("existe déjà") ?? false;
            return isConflict
                ? Conflict(new { message = error })
                : BadRequest(new { message = error });
        }

        return Created($"/api/auth/{user.Id}", new { user.Id, user.Username, user.HederaAccountId });
    }

    [HttpPost("challenge")]
    [ProducesResponseType(typeof(ChallengeResponse), StatusCodes.Status200OK)]
    public async Task<ChallengeResponse> Challenge([FromBody] ChallengeRequest request)
        => await authService.GenerateChallengeAsync(request.HederaAccountId);

    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var response = await authService.LoginAsync(request);
        if (response is null)
            return Unauthorized(new { message = "Invalid signature or expired challenge." });

        return Ok(response);
    }
}
