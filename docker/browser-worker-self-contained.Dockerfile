# Browser Worker Dockerfile - Self-contained version
# Based on concepts from johnymoo/chrome-novnc-docker
# Builds complete browser environment with noVNC and CDP

# Try multiple base image sources
FROM docker.1ms.run/library/ubuntu:22.04

LABEL maintainer="OPS Automation"
LABEL description="Browser Worker with noVNC and Chrome DevTools Protocol"

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    apt-transport-https \
    ca-certificates \
    supervisor \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    tigervnc-standalone-server \
    tigervnc-common \
    fluxbox \
    xterm \
    net-tools \
    procps \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome (not Chromium which requires snap)
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo "deb [arch=arm64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# Create chrome user
RUN useradd -m -s /bin/bash chrome && \
    mkdir -p /home/chrome/.config/chromium && \
    chown -R chrome:chrome /home/chrome

# Configure VNC
RUN mkdir -p /var/log/vnc && \
    mkdir -p /home/chrome/.vnc && \
    chown -R chrome:chrome /var/log/vnc /home/chrome/.vnc

# Set up noVNC
RUN ln -s /usr/share/novnc/www /home/chrome/novnc && \
    chown -R chrome:chrome /home/chrome/novnc

# Environment variables
ENV DISPLAY=:0 \
    VNC_PORT=5900 \
    NOVNC_PORT=8080 \
    CDP_PORT=9222 \
    VNC_PASSWORD=chrome123 \
    DISPLAY_WIDTH=1920 \
    DISPLAY_HEIGHT=1080

# Create supervisor config
RUN mkdir -p /var/log/supervisor
COPY browser-worker.supervisord.conf /etc/supervisor/conf.d/browser-worker.conf

# Create entrypoint script
COPY browser-worker.entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create healthcheck script
COPY browser-worker.healthcheck.sh /healthcheck.sh
RUN chmod +x /healthcheck.sh

# Expose ports
# 8080 - noVNC web interface
# 9222 - Chrome DevTools Protocol (CDP)
# 5900 - VNC (optional, for direct VNC clients)
EXPOSE 8080 9222 5900

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /healthcheck.sh || exit 1

# Entry point
ENTRYPOINT ["/entrypoint.sh"]
CMD ["--remote-debugging-port=9222"]