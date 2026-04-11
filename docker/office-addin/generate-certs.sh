#!/bin/bash
# 生成 Office Add-in 所需的 SSL 证书

CERTS_DIR="$(dirname "$0")/certs"
mkdir -p "$CERTS_DIR"

echo "生成自签名 SSL 证书..."

openssl req -x509 -newkey rsa:2048 -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -days 365 -nodes \
    -subj "/C=CN/ST=Shanghai/L=Shanghai/O=Carbone/OU=Addin/CN=localhost"

echo "证书生成完成:"
echo "  - $CERTS_DIR/server.crt"
echo "  - $CERTS_DIR/server.key"
echo ""
echo "重要: 需要将证书添加到系统信任列表"
echo "MacOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERTS_DIR/server.crt"
echo "Windows: 将 server.crt 添加到 '受信任的根证书颁发机构'"