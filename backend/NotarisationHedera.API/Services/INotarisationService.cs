using NotarisationHedera.API.Models.DTOs;

namespace NotarisationHedera.API.Services;

public interface INotarisationService
{
    Task<NotariseResponse> NotariseAsync(int userId, NotariseRequest request);
    Task<VerifyResponse> VerifyAsync(VerifyRequest request);
    Task<IEnumerable<NotariseResponse>> GetUserRecordsAsync(int userId);
    Task<(byte[]? Content, string FileName)> GetPdfContentAsync(int userId, int recordId);
}
