# Carbone Engine Dockerfile
# Optimized with LibreOffice pre-installed to avoid runtime installation overhead

FROM node:20-bullseye

# Install LibreOffice with retries because Debian mirrors can close long downloads.
RUN apt-get -o Acquire::Retries=5 update \
    && apt-get -o Acquire::Retries=5 install -y --fix-missing --no-install-recommends \
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
