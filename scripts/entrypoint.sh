#!/bin/sh
set -eu
mkdir -p "${DATA_DIR:-/data}/releases"
cp /app/releases/LANControl.Installer.exe /app/releases/LANControl-Setup.zip /app/releases/LANControl-Setup.sha256 "${DATA_DIR:-/data}/releases/"
chown -R node:node "${DATA_DIR:-/data}"
exec gosu node npm start
