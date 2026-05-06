using System.ComponentModel.DataAnnotations;

namespace NotarisationHedera.API.Models.DTOs;

public record NotariseRequest(
    // SHA-256 hash computed client-side (hex, 64 chars)
    [Required, Length(64, 64)] string DocumentHash,
    [Required] string FileName,
    string? Folder    = null,   // e.g. training name — used for grouping in "Mes documents"
    string? PdfBase64 = null    // optional PDF bytes (base64) stored for re-download
);

public record NotariseResponse(
    int Id,
    string DocumentHash,
    string FileName,
    string? Folder,
    string HederaTransactionId,
    DateTime? ConsensusTimestamp,
    DateTime NotarisedAt,
    bool HasPdf   // true if PDF content is available for re-download
);

public record VerifyRequest(
    // SHA-256 hash computed client-side
    [Required, Length(64, 64)] string DocumentHash
);

public record VerifyResponse(
    bool IsAuthentic,
    string DocumentHash,
    string? HederaTransactionId,
    DateTime? ConsensusTimestamp,
    DateTime? NotarisedAt,
    string? NotarisedBy,
    string? FileName
);
