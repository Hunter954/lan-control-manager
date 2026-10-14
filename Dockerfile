FROM gradle:8.13-jdk17 AS android
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android-sdk
RUN mkdir -p /opt/android-sdk/cmdline-tools && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -o /tmp/sdk.zip && unzip -q /tmp/sdk.zip -d /opt/android-sdk/cmdline-tools && mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest && rm /tmp/sdk.zip
RUN yes | /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null
RUN /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager 'platforms;android-35' 'build-tools;35.0.0'
WORKDIR /src
COPY mobile/ mobile/
RUN gradle --no-daemon -p mobile assembleRelease
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
FROM windows AS installer
COPY --from=build /app/releases/LANControl-Setup.zip /payload/LANControl-Setup.zip
RUN dotnet publish windows/installer/LANControl.Installer.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:AgentBundlePath=/payload/LANControl-Setup.zip -o /installer-bin
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu openjdk-17-jre-headless && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
COPY --from=installer /installer-bin/LANControl.Installer.exe /app/releases/LANControl.Installer.exe
COPY --from=android /src/mobile/app/build/outputs/apk/release/app-release-unsigned.apk /app/releases/LANControl-Android-unsigned.apk
COPY --from=android /opt/android-sdk/build-tools/35.0.0/zipalign /app/android-tools/zipalign
COPY --from=android /opt/android-sdk/build-tools/35.0.0/lib/apksigner.jar /app/android-tools/apksigner.jar
COPY --from=android /opt/android-sdk/build-tools/35.0.0/lib64 /app/android-tools/lib64
RUN chmod +x scripts/entrypoint.sh /app/android-tools/zipalign
EXPOSE 3000
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
