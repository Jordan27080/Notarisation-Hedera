using System.Text.Json;

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
            logger.LogError(ex, "Unhandled exception");
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var body = JsonSerializer.Serialize(new { message = "An internal error occurred." });
            await context.Response.WriteAsync(body);
        }
    }
}
