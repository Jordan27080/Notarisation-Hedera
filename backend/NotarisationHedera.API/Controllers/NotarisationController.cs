using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NotarisationHedera.API.Models.DTOs;
using NotarisationHedera.API.Services;

namespace NotarisationHedera.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotarisationController(INotarisationService notarisationService) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType(typeof(NotariseResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Notarise([FromBody] NotariseRequest request)
    {
        var userId = GetUserId();
        var result = await notarisationService.NotariseAsync(userId, request);
        return Ok(result);
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<NotariseResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyRecords()
    {
        var userId = GetUserId();
        var records = await notarisationService.GetUserRecordsAsync(userId);
        return Ok(records);
    }

    private int GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return int.Parse(claim);
    }
}
