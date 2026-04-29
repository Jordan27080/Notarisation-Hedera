using System.Security.Cryptography;
using NSec.Cryptography;

namespace NotarisationHedera.API.Services;

public class CryptoService : ICryptoService
{
    public bool VerifyEd25519Signature(byte[] message, string signatureHex, string publicKeyHex)
    {
        try
        {
            var pubKeyBytes = Convert.FromHexString(publicKeyHex);
            var signatureBytes = Convert.FromHexString(signatureHex);

            var algorithm = SignatureAlgorithm.Ed25519;
            var publicKey = PublicKey.Import(algorithm, pubKeyBytes, KeyBlobFormat.RawPublicKey);
            return algorithm.Verify(publicKey, message, signatureBytes);
        }
        catch
        {
            return false;
        }
    }

    public string GenerateNonce()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
