#!/bin/bash
# Entrypoint script - performs setup before starting services

set -e

echo "Browser Recorder Container"
echo "=========================="

# Ensure required directories exist (running as root)
mkdir -p /home/chrome/downloads
mkdir -p /home/chrome/.config/google-chrome
mkdir -p /tmp/.X11-unix
mkdir -p /tmp/codegen
chmod 1777 /tmp/.X11-unix

# Set proper ownership
chown -R chrome:chrome /home/chrome

# Run the command
# For codegen mode, we need to run as root to access Playwright
exec "$@"