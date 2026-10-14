FROM mcr.microsoft.com/dotnet/sdk:10.0 AS windows
WORKDIR /src
COPY windows/ windows/
RUN dotnet publish windows/agent/LANControl.Agent.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o /windows-bin
RUN dotnet publish windows/updater/LANControl.Updater.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o /windows-bin
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
COPY --from=windows /windows-bin /windows-bin
RUN node scripts/package-installer.mjs /windows-bin /app/releases
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN chmod +x scripts/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
