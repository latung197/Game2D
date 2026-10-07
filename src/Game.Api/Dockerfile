FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY Game.sln ./
COPY src/ ./src/
RUN dotnet publish src/Game.Api/Game.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Game.Api.dll"]
