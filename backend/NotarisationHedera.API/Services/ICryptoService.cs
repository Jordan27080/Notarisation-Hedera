namespace NotarisationHedera.API.Services;

public interface ICryptoService
{
    /// <summary>
    /// Verifies an ED25519 signature.
    /// </summary>
    /// <param name="message">Raw message bytes that were signed.</param>
    /// <param name="signatureHex">Hex-encoded 64-byte ED25519 signature.</param>
    /// <param name="publicKeyHex">Hex-encoded 32-byte ED25519 public key.</param>
    bool VerifyEd25519Signature(byte[] message, string signatureHex, string publicKeyHex);

    /// <summary>Generates a cryptographically random nonce (hex).</summary>
    string GenerateNonce();
}
