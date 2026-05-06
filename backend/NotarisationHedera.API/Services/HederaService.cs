using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Hashgraph;

namespace NotarisationHedera.API.Services;

public class HederaService : IHederaService
{
    private readonly IConfiguration _config;
    private readonly ILogger<HederaService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _network;
    private readonly string _operatorAccountId;
    private readonly string _operatorPrivateKey;
    private readonly string _topicId;

    public HederaService(IConfiguration config, ILogger<HederaService> logger, IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _network             = config["Hedera:Network"] ?? "testnet";
        _operatorAccountId   = config["Hedera:OperatorAccountId"] ?? string.Empty;
        _operatorPrivateKey  = config["Hedera:OperatorPrivateKey"] ?? string.Empty;
        _topicId             = config["Hedera:TopicId"] ?? string.Empty;
    }

    /// <summary>
    /// Vérifie que toutes les variables Hedera sont renseignées et lève une exception
    /// explicite si ce n'est pas le cas (évite le cryptique FormatException plus bas).
    /// </summary>
    private void EnsureConfigured()
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_operatorAccountId))  missing.Add("Hedera:OperatorAccountId");
        if (string.IsNullOrWhiteSpace(_operatorPrivateKey)) missing.Add("Hedera:OperatorPrivateKey");
        if (string.IsNullOrWhiteSpace(_topicId))            missing.Add("Hedera:TopicId");

        if (missing.Count == 0) return;

        var hint =
            "Copiez appsettings.Development.json.example → appsettings.Development.json " +
            "et renseignez votre compte Hedera (https://portal.hedera.com).";

        throw new InvalidOperationException(
            $"Configuration Hedera incomplète — clés manquantes : {string.Join(", ", missing)}. {hint}");
    }

    public async Task<(string TransactionId, DateTime ConsensusTimestamp)> RecordHashAsync(
        string documentHash, string fileName, string hederaAccountId)
    {
        EnsureConfigured();
        var client = BuildClient();

        var payload = JsonSerializer.Serialize(new
        {
            hash = documentHash,
            file = fileName,
            notarisedBy = hederaAccountId,
            timestamp = DateTime.UtcNow
        });
        var messageBytes = (ReadOnlyMemory<byte>)Encoding.UTF8.GetBytes(payload);

        var record = await client.SubmitMessageWithRecordAsync(
            ParseAddress(_topicId),
            messageBytes);

        // Format: "0.0.XXXXX@seconds.nanos"  (mirror node standard)
        var txId = $"{record.Id.Address.ShardNum}.{record.Id.Address.RealmNum}.{record.Id.Address.AccountNum}" +
                   $"@{record.Id.ValidStartSeconds}.{record.Id.ValidStartNanos}";
        var consensusTime = record.Concensus ?? DateTime.UtcNow;

        _logger.LogInformation("Hash recorded on Hedera HCS. TxId={TxId} Consensus={Ts}", txId, consensusTime);
        return (txId, consensusTime);
    }

    public async Task<(string TransactionId, DateTime ConsensusTimestamp)?> GetRecordAsync(string transactionId)
    {
        // Verify via Hedera mirror node REST API (avoids TxId parsing complexity)
        try
        {
            var mirrorBase = _network == "mainnet"
                ? "https://mainnet-public.mirrornode.hedera.com"
                : "https://testnet.mirrornode.hedera.com";

            // Convert "0.0.12345@1234567890.000000000" → "0.0.12345-1234567890-000000000"
            var txIdForMirror = ToMirrorNodeTxId(transactionId);
            var url = $"{mirrorBase}/api/v1/transactions/{txIdForMirror}";

            var http = _httpClientFactory.CreateClient();
            var response = await http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("transactions", out var txs)) return null;
            if (txs.GetArrayLength() == 0) return null;

            return (transactionId, DateTime.UtcNow);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Mirror node lookup failed for {TxId}", transactionId);
            return null;
        }
    }

    public async Task<string?> GetAccountPublicKeyAsync(string hederaAccountId)
    {
        try
        {
            var mirrorBase = _network == "mainnet"
                ? "https://mainnet-public.mirrornode.hedera.com"
                : "https://testnet.mirrornode.hedera.com";

            var http = _httpClientFactory.CreateClient();
            var response = await http.GetAsync($"{mirrorBase}/api/v1/accounts/{hederaAccountId}");
            if (!response.IsSuccessStatusCode) return null;

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("key", out var key) &&
                key.TryGetProperty("key", out var keyValue))
                return keyValue.GetString();

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not retrieve public key for {AccountId}", hederaAccountId);
            return null;
        }
    }

    // "0.0.12345@1234567890.000000000" → "0.0.12345-1234567890-000000000"
    // Also handles legacy C# object-toString format:
    // "TxId { Address = Address { ShardNum = 0, RealmNum = 0, AccountNum = 12345 },
    //         ValidStartSeconds = 1234567890, ValidStartNanos = 123456789 }"
    private static string ToMirrorNodeTxId(string txId)
    {
        // Standard format: "0.0.12345@1234567890.000000000"
        var m = Regex.Match(txId, @"^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$");
        if (m.Success)
            return $"{m.Groups[1].Value}-{m.Groups[2].Value}-{m.Groups[3].Value}";

        // Legacy C# object-toString format
        var legacy = Regex.Match(txId,
            @"ShardNum\s*=\s*(\d+).*?RealmNum\s*=\s*(\d+).*?AccountNum\s*=\s*(\d+).*?" +
            @"ValidStartSeconds\s*=\s*(\d+).*?ValidStartNanos\s*=\s*(\d+)",
            RegexOptions.Singleline);
        if (legacy.Success)
        {
            var shard   = legacy.Groups[1].Value;
            var realm   = legacy.Groups[2].Value;
            var account = legacy.Groups[3].Value;
            var secs    = legacy.Groups[4].Value;
            var nanos   = legacy.Groups[5].Value;
            return $"{shard}.{realm}.{account}-{secs}-{nanos}";
        }

        return txId;
    }

    private static Address ParseAddress(string id)
    {
        var p = id.Trim().Split('.');
        return new Address(long.Parse(p[0]), long.Parse(p[1]), long.Parse(p[2]));
    }

    private Client BuildClient() => new Client(ctx =>
    {
        ctx.Gateway = _network == "mainnet"
            ? new Gateway("35.237.200.180:50211", 0, 0, 3)
            : new Gateway("0.testnet.hedera.com:50211", 0, 0, 3);
        ctx.Payer = ParseAddress(_operatorAccountId);
        ctx.Signatory = new Signatory(Hex.ToBytes(_operatorPrivateKey));
    });
}
