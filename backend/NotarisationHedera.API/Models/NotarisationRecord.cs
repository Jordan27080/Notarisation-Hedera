using System.ComponentModel.DataAnnotations;

namespace NotarisationHedera.API.Models;

public class NotarisationRecord
{
    public int Id { get; set; }

    // SHA-256 hash of the document (hex)
    [Required, MaxLength(64)]
    public string DocumentHash { get; set; } = string.Empty;

    // Original file name (metadata only, file is never stored)
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    // Optional grouping folder (e.g. training name for certificates)
    [MaxLength(255)]
    public string? Folder { get; set; }

    // Hedera transaction ID returned after recording the hash on HCS
    [Required, MaxLength(255)]
    public string HederaTransactionId { get; set; } = string.Empty;

    // Hedera consensus timestamp (immutable proof of existence)
    public DateTime? ConsensusTimestamp { get; set; }

    public DateTime NotarisedAt { get; set; } = DateTime.UtcNow;

    public int UserId { get; set; }
    public User User { get; set; } = null!;
}
