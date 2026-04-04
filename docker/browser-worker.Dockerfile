# Browser Worker Dockerfile
# Based on johnymoo/chrome-novnc-docker
# Chrome + Xvfb + noVNC for browser automation with CDP support

FROM docker.1ms.run/library/ubuntu:22.04

LABEL maintainer="OPS Automation"
LABEL description="Chrome + Xvfb + noVNC for browser automation"

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV SCREEN_WIDTH=1920
ENV SCREEN_HEIGHT=1080
ENV SCREEN_DEPTH=24

# Use mirrors for better connectivity
RUN sed -i 's|http://ports.ubuntu.com|http://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list || true

# Install Node.js 20 (needed for Playwright)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN apt-get update && apt-get install -y \
    # X11 and display
    xvfb \
    x11-utils \
    x11vnc \
    xdotool \
    fluxbox \
    # noVNC and websockify
    novnc \
    websockify \
    # Chrome dependencies
    wget \
    curl \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    # Chinese fonts support
    fonts-wqy-microhei \
    fonts-noto-cjk \
    # Utils
    python3 \
    python3-pip \
    net-tools \
    procps \
    sudo \
    gosu \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Install Python Playwright for AI control mode (use China mirror)
RUN pip3 config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip3 install playwright && \
    python3 -m playwright install chromium && \
    echo "=== Python Playwright installed ===" && \
    python3 -c "from playwright.sync_api import sync_playwright; print('Playwright Python OK')"

# Set up Chromium from Python Playwright installation
RUN echo "=== Playwright cache contents ===" && \
    ls -la /root/.cache/ms-playwright/ && \
    CHROMIUM_DIR=$(ls -d /root/.cache/ms-playwright/chromium-* 2>/dev/null | head -1) && \
    if [ -n "$CHROMIUM_DIR" ]; then \
        echo "Found Chromium dir: ${CHROMIUM_DIR}" && \
        ls -la "${CHROMIUM_DIR}/" && \
        CHROME_BIN=$(find "${CHROMIUM_DIR}" -type f -name "chrome" | head -1) && \
        echo "Chrome binary: ${CHROME_BIN}" && \
        mv "${CHROMIUM_DIR}" /opt/chromium && \
        ln -sf /opt/chromium/chrome-linux/chrome /usr/bin/google-chrome && \
        chmod +x /opt/chromium/chrome-linux/chrome && \
        chmod -R a+rx /opt/chromium && \
        ln -sf /opt/chromium /root/.cache/ms-playwright/chromium-$(basename "${CHROMIUM_DIR}" | sed 's/chromium-//') && \
        ls -la /usr/bin/google-chrome && \
        ls -la /opt/chromium/chrome-linux/; \
    else \
        echo "No Chromium found, using npm playwright"; \
        npm config set registry https://registry.npmmirror.com && \
        npm install -g playwright && \
        npx playwright install chromium --with-deps && \
        CHROMIUM_DIR=$(ls -d /root/.cache/ms-playwright/chromium-* | head -1) && \
        mv "${CHROMIUM_DIR}" /opt/chromium && \
        ln -sf /opt/chromium/chrome-linux/chrome /usr/bin/google-chrome; \
    fi && \
    ls -la /root/.cache/ms-playwright/

# Create non-root user for Chrome
RUN useradd -m -s /bin/bash chrome \
    && mkdir -p /home/chrome/downloads \
    && chown -R chrome:chrome /home/chrome

# Copy startup scripts
COPY scripts/start.sh /start.sh
COPY scripts/start-recorder.sh /start-recorder.sh
COPY scripts/entrypoint.sh /entrypoint.sh
COPY scripts/codegen-api.py /scripts/codegen-api.py
COPY browser-chrome/scripts/execute-actions.js /scripts/execute-actions.js
RUN chmod +x /start.sh /start-recorder.sh /entrypoint.sh /scripts/codegen-api.py /scripts/execute-actions.js

# Create necessary directories
RUN mkdir -p /var/log/supervisor /tmp/.X11-unix /tmp/codegen /scripts && chmod 1777 /tmp/.X11-unix

# Expose ports
# 8080 - noVNC web interface
# 5900 - VNC server
# 9222 - Chrome DevTools Protocol
# 3000 - Codegen API
EXPOSE 8080 5900 9222 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080 && curl -f http://localhost:3000/health || exit 1

# Set working directory
WORKDIR /home/chrome

# Start services (running as root to handle setup, entrypoint will switch to chrome user)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/start.sh"]