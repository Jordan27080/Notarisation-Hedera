using System.ComponentModel.DataAnnotations;

namespace NotarisationHedera.API.Models;

public class User
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Email { get; set; } = string.Empty;

    // ED25519 public key (hex) linked to Hedera account
    [Required, MaxLength(256)]
    public string PublicKeyHex { get; set; } = string.Empty;

    // Hedera account ID (e.g. "0.0.12345")
    [Required, MaxLength(50)]
    public string HederaAccountId { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<NotarisationRecord> NotarisationRecords { get; set; } = new List<NotarisationRecord>();
}
