using System.Text.Json;
using NotarisationHedera.API.Services;

namespace NotarisationHedera.API.Middleware;

public class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            var (status, message) = Translate(ex);

            // Une erreur attendue et diagnosticable ne mérite pas un log d'erreur :
            // la stack complète n'est utile que pour le 500 générique.
            if (status == StatusCodes.Status500InternalServerError)
                logger.LogError(ex, "Unhandled exception");
            else
                logger.LogWarning("Requête rejetée ({Status}) : {Message}", status, message);

            // Si la réponse a déjà commencé à partir, on ne peut plus rien écrire :
            // tenter de le faire lèverait une seconde exception qui masquerait la première.
            if (context.Response.HasStarted)
            {
                logger.LogWarning("Réponse déjà entamée — corps d'erreur non écrit.");
                return;
            }

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
        }
    }

    /// <summary>
    /// Traduit une exception en couple (statut HTTP, message destiné au client).
    /// Seules les exceptions métier connues exposent leur message ; le reste
    /// reste volontairement opaque pour ne rien divulguer.
    /// </summary>
    private static (int Status, string Message) Translate(Exception ex) => ex switch
    {
        // Réseau Hedera injoignable — l'appelant peut réessayer plus tard.
        HederaUnavailableException
            => (StatusCodes.Status503ServiceUnavailable, ex.Message),

        // Le réseau a répondu et refusé : c'est un problème en amont de notre API.
        HederaRejectedException
            => (StatusCodes.Status502BadGateway, ex.Message),

        // Déploiement mal configuré : 500 légitime, mais avec la cause exacte.
        HederaConfigurationException
            => (StatusCodes.Status500InternalServerError, ex.Message),

        _ => (StatusCodes.Status500InternalServerError, "An internal error occurred."),
    };
}
