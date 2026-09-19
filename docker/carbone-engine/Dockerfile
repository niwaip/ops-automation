# Carbone Engine Dockerfile
# Optimized with LibreOffice pre-installed to avoid runtime installation overhead

FROM node:20-bookworm

ARG APT_MIRROR=mirrors.aliyun.com

# Configure apt mirror for reliable downloads across regions
RUN if [ -n "${APT_MIRROR}" ]; then \
      if [ -f /etc/apt/sources.list ]; then \
        sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list && \
        sed -i "s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list; \
      fi; \
      if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && \
        sed -i "s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
      fi; \
    fi

# Install LibreOffice with retries because Debian mirrors can close long downloads.
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=60 update \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=60 install -y --fix-missing --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-noto-cjk \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3009
ENV TEMPLATES_DIR=/app/templates
ENV OUTPUTS_DIR=/app/outputs
ENV LIBREOFFICE_PATH=/usr/bin/soffice
ENV TMP_DIR=/tmp/carbone-preview

# The source code will be mounted in development, 
# but we provide the structure for production usage
EXPOSE 3009

# Default healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:3009/api || exit 1

# Default command for development (can be overridden in compose)
CMD ["sh", "-c", "npm config set registry https://registry.npmmirror.com && npm install && npm run dev"]
