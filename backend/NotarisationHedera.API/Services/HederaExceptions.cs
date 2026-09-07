namespace NotarisationHedera.API.Services;

/// <summary>
/// Base des erreurs Hedera que l'API sait traduire en réponse HTTP explicite
/// (voir <see cref="Middleware.ExceptionMiddleware"/>). Tout ce qui n'en dérive
/// pas reste un 500 générique.
/// </summary>
public abstract class HederaException(string message, Exception? inner = null)
    : Exception(message, inner);

/// <summary>
/// Configuration Hedera absente ou incomplète — erreur de déploiement, pas d'usage.
/// </summary>
public sealed class HederaConfigurationException(string message)
    : HederaException(message);

/// <summary>
/// Le réseau Hedera n'a pas pu être joint : nœud de consensus injoignable,
/// timeout gRPC, ou port sortant 50211/50212 filtré par un pare-feu.
/// L'opération est rejouable telle quelle une fois la connectivité rétablie.
/// </summary>
public sealed class HederaUnavailableException(string message, Exception? inner = null)
    : HederaException(message, inner);

/// <summary>
/// Le réseau Hedera a bien répondu mais a refusé la transaction pour une raison
/// métier (solde insuffisant, topic invalide, signature incorrecte…).
/// Rejouer à l'identique ne changera rien.
/// </summary>
public sealed class HederaRejectedException(string status, string message, Exception? inner = null)
    : HederaException(message, inner)
{
    /// <summary>Code de statut renvoyé par le réseau (ex. « InsufficientTxFee »).</summary>
    public string Status { get; } = status;
}
