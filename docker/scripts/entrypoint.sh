#!/bin/bash
# Entrypoint script - performs setup before starting services

set -e

echo "Chrome + Xvfb + noVNC Container"
echo "================================"

# Ensure required directories exist (running as root)
mkdir -p /home/chrome/downloads
mkdir -p /home/chrome/.config/google-chrome
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

# Set proper ownership
chown -R chrome:chrome /home/chrome

echo "Switching to chrome user..."
exec gosu chrome "$@"