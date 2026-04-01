# Browser Worker Dockerfile
# Based on johnymoo/chrome-novnc-docker with CDP support

FROM johnymoo/chrome-novnc-docker:latest

LABEL maintainer="OPS Automation"
LABEL description="Browser Worker with noVNC and Chrome DevTools Protocol"

# Environment variables
ENV CHROME_REMOTE_DESKTOP_PORT=9222 \
    NOVNC_PORT=8080 \
    VNC_PORT=5900 \
    CHROME_PROFILE_PATH=/home/chrome/.config/google-chrome

# Switch to root for system setup
USER root

# Install required packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    netcat-openbsd \
    procps \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Create profile directory structure
RUN mkdir -p ${CHROME_PROFILE_PATH} && \
    chown -R chrome:chrome ${CHROME_PROFILE_PATH}

# Create logs directory
RUN mkdir -p /var/log/browser-worker && \
    chown -R chrome:chrome /var/log/browser-worker

# Copy entrypoint script
COPY browser-worker.entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy health check script
COPY browser-worker.healthcheck.sh /healthcheck.sh
RUN chmod +x /healthcheck.sh

# Switch back to chrome user
USER chrome

# Expose ports
# 8080 - noVNC web interface
# 9222 - Chrome DevTools Protocol (CDP)
# 5900 - VNC (optional, for direct VNC clients)
EXPOSE 8080 9222 5900

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /healthcheck.sh || exit 1

# Set default Chrome arguments
ENV CHROME_ARGS="--remote-debugging-port=9222 --no-first-run --no-default-browser-check --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-infobars --disable-breakpad --disable-component-update --disable-default-apps --disable-extensions --disable-sync --metrics-recording-only --no-sandbox --disable-setuid-sandbox --disable-gpu-sandbox --disable-dev-shm-usage"

# Entry point
ENTRYPOINT ["/entrypoint.sh"]
CMD ["--remote-debugging-port=9222"]