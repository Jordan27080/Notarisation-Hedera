using Microsoft.AspNetCore.Mvc;
using NotarisationHedera.API.Models.DTOs;
using NotarisationHedera.API.Services;

namespace NotarisationHedera.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VerificationController(INotarisationService notarisationService) : ControllerBase
{
    // Public endpoint — no authentication required for verification
    [HttpPost("verify")]
    [ProducesResponseType(typeof(VerifyResponse), StatusCodes.Status200OK)]
    public async Task<VerifyResponse> Verify([FromBody] VerifyRequest request)
        => await notarisationService.VerifyAsync(request);
}
