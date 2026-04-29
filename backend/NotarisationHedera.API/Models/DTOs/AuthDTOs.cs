using System.ComponentModel.DataAnnotations;

namespace NotarisationHedera.API.Models.DTOs;

public record RegisterRequest(
    [Required] string Username,
    [Required, EmailAddress] string Email,
    [Required] string HederaAccountId,
    // ED25519 public key in hex (derived from private key client-side)
    [Required] string PublicKeyHex
);

public record ChallengeRequest(
    [Required] string HederaAccountId
);

public record ChallengeResponse(
    string Nonce,
    string Message,
    DateTime ExpiresAt
);

public record LoginRequest(
    [Required] string HederaAccountId,
    // Nonce returned by /auth/challenge
    [Required] string Nonce,
    // ED25519 signature of the nonce, hex-encoded
    [Required] string SignatureHex
);

public record LoginResponse(
    string Token,
    string Username,
    string HederaAccountId,
    DateTime ExpiresAt
);
