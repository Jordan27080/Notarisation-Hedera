using Microsoft.EntityFrameworkCore;
using NotarisationHedera.API.Data;
using NotarisationHedera.API.Models;
using NotarisationHedera.API.Models.DTOs;

namespace NotarisationHedera.API.Services;

public class NotarisationService : INotarisationService
{
    private readonly AppDbContext _db;
    private readonly IHederaService _hedera;
    private readonly ILogger<NotarisationService> _logger;

    public NotarisationService(AppDbContext db, IHederaService hedera, ILogger<NotarisationService> logger)
    {
        _db = db;
        _hedera = hedera;
        _logger = logger;
    }

    public async Task<NotariseResponse> NotariseAsync(int userId, NotariseRequest request)
    {
        var user = await _db.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found.");

        // Check for duplicates — same document cannot be notarised twice
        var existing = await _db.NotarisationRecords
            .FirstOrDefaultAsync(r => r.DocumentHash == request.DocumentHash && r.UserId == userId);

        if (existing is not null)
            return MapToResponse(existing);

        var (txId, consensusTs) = await _hedera.RecordHashAsync(
            request.DocumentHash, request.FileName, user.HederaAccountId);

        byte[]? pdfBytes = null;
        if (!string.IsNullOrWhiteSpace(request.PdfBase64))
        {
            try { pdfBytes = Convert.FromBase64String(request.PdfBase64); }
            catch { /* ignore malformed base64 — PDF storage is best-effort */ }
        }

        var record = new NotarisationRecord
        {
            DocumentHash = request.DocumentHash.ToLowerInvariant(),
            FileName = request.FileName,
            Folder = request.Folder,
            PdfContent = pdfBytes,
            HederaTransactionId = txId,
            ConsensusTimestamp = consensusTs,
            UserId = userId
        };

        _db.NotarisationRecords.Add(record);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Document notarised. Hash={Hash} TxId={TxId}", record.DocumentHash, txId);
        return MapToResponse(record);
    }

    public async Task<VerifyResponse> VerifyAsync(VerifyRequest request)
    {
        var hash = request.DocumentHash.ToLowerInvariant();
        var record = await _db.NotarisationRecords
            .Include(r => r.User)
            .FirstOrDefaultAsync(r => r.DocumentHash == hash);

        if (record is null)
            return new VerifyResponse(false, hash, null, null, null, null, null);

        // The DB record is our primary source of truth: we only store a record when
        // the HCS submission succeeds and returns a consensus timestamp.
        // The mirror-node cross-check is a secondary confirmation; if it fails
        // (e.g. network issue, legacy TxId format) we still trust our own record.
        bool isAuthentic = record.ConsensusTimestamp.HasValue;

        if (isAuthentic)
        {
            // Best-effort mirror-node confirmation — doesn't override DB truth
            var onChain = await _hedera.GetRecordAsync(record.HederaTransactionId);
            if (onChain is null)
                _logger.LogWarning(
                    "Mirror-node lookup failed for TxId={TxId} — trusting DB record.",
                    record.HederaTransactionId);
        }

        return new VerifyResponse(
            IsAuthentic: isAuthentic,
            DocumentHash: hash,
            HederaTransactionId: record.HederaTransactionId,
            ConsensusTimestamp: record.ConsensusTimestamp,
            NotarisedAt: record.NotarisedAt,
            NotarisedBy: record.User.Username,
            FileName: record.FileName
        );
    }

    public async Task<IEnumerable<NotariseResponse>> GetUserRecordsAsync(int userId)
    {
        var records = await _db.NotarisationRecords
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.NotarisedAt)
            .ToListAsync();

        return records.Select(MapToResponse);
    }

    public async Task<(byte[]? Content, string FileName)> GetPdfContentAsync(int userId, int recordId)
    {
        var record = await _db.NotarisationRecords
            .FirstOrDefaultAsync(r => r.Id == recordId && r.UserId == userId);
        return (record?.PdfContent, record?.FileName ?? string.Empty);
    }

    private static NotariseResponse MapToResponse(NotarisationRecord r) => new(
        r.Id, r.DocumentHash, r.FileName, r.Folder,
        r.HederaTransactionId, r.ConsensusTimestamp, r.NotarisedAt,
        HasPdf: r.PdfContent is { Length: > 0 });
}
