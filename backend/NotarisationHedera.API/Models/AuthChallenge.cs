namespace NotarisationHedera.API.Models;

// Stored in-memory cache (not persisted); expires after a short TTL
public class AuthChallenge
{
    public string Nonce { get; set; } = string.Empty;
    public string HederaAccountId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }

    public bool IsExpired() => DateTime.UtcNow > ExpiresAt;
}
