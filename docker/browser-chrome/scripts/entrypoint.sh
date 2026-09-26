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
rm -f /tmp/.X*-lock /tmp/.X11-unix/X*

# Disable Chromium & Google Chrome password manager and autofill prompts
mkdir -p /etc/chromium/policies/managed /etc/opt/chrome/policies/managed
cat << 'EOF' > /etc/chromium/policies/managed/no-password-management.json
{
  "PasswordManagerEnabled": false,
  "AutoFillEnabled": false,
  "AutofillAddressEnabled": false,
  "AutofillCreditCardEnabled": false
}
EOF
cp /etc/chromium/policies/managed/no-password-management.json /etc/opt/chrome/policies/managed/no-password-management.json 2>/dev/null || true

# Set proper ownership
chown -R chrome:chrome /home/chrome

# Run the command
# For codegen mode, we need to run as root to access Playwright
exec "$@"