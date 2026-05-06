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

    [HttpGet("{id:int}/download")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadPdf(int id)
    {
        var userId = GetUserId();
        var (content, fileName) = await notarisationService.GetPdfContentAsync(userId, id);
        if (content is null or { Length: 0 })
            return NotFound("PDF non disponible pour ce document.");
        return File(content, "application/pdf", fileName);
    }

    private int GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? throw new UnauthorizedAccessException();
        return int.Parse(claim);
    }
}
