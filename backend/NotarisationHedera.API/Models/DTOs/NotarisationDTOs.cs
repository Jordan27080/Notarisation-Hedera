using System.ComponentModel.DataAnnotations;

namespace NotarisationHedera.API.Models.DTOs;

public record NotariseRequest(
    // SHA-256 hash computed client-side (hex, 64 chars)
    [Required, Length(64, 64)] string DocumentHash,
    [Required] string FileName
);

public record NotariseResponse(
    int Id,
    string DocumentHash,
    string FileName,
    string HederaTransactionId,
    DateTime? ConsensusTimestamp,
    DateTime NotarisedAt
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
