namespace NotarisationHedera.API.Services;

public interface IHederaService
{
    /// <summary>
    /// Submits a SHA-256 document hash to Hedera Consensus Service.
    /// Returns the Hedera transaction ID.
    /// </summary>
    Task<(string TransactionId, DateTime ConsensusTimestamp)> RecordHashAsync(
        string documentHash,
        string fileName,
        string hederaAccountId);

    /// <summary>
    /// Looks up a consensus message by transaction ID.
    /// Returns null if not found.
    /// </summary>
    Task<(string TransactionId, DateTime ConsensusTimestamp)?> GetRecordAsync(string transactionId);

    /// <summary>
    /// Retrieves the ED25519 public key associated with a Hedera account.
    /// Used to verify the user's identity during challenge-response auth.
    /// </summary>
    Task<string?> GetAccountPublicKeyAsync(string hederaAccountId);
}
