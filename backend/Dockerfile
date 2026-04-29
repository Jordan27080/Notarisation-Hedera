FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY NotarisationHedera.API/NotarisationHedera.API.csproj NotarisationHedera.API/
RUN dotnet restore NotarisationHedera.API/NotarisationHedera.API.csproj
COPY . .
RUN dotnet publish NotarisationHedera.API/NotarisationHedera.API.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
ENV ConnectionStrings__DefaultConnection="Server=db;Port=3306;Database=notarisation;User=root;Password=;"
EXPOSE 7001
ENTRYPOINT ["dotnet", "NotarisationHedera.API.dll"]
