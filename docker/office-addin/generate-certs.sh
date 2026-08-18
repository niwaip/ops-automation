#!/bin/bash
# 生成 Office Add-in 所需的 TLS 证书

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/runtime-certs"
TMP_CONFIG="$(mktemp)"
mkdir -p "$CERTS_DIR"

cleanup() {
    rm -f "$TMP_CONFIG"
}

trap cleanup EXIT

add_unique_host() {
    local candidate="$1"
    local existing

    [ -n "$candidate" ] || return 0

    for existing in "${TLS_HOSTS[@]:-}"; do
        if [ "$existing" = "$candidate" ]; then
            return 0
        fi
    done

    TLS_HOSTS+=("$candidate")
}

TLS_HOSTS=()

if [ -n "${OFFICE_ADDIN_TLS_HOSTS:-}" ]; then
    IFS=',' read -r -a RAW_HOSTS <<< "${OFFICE_ADDIN_TLS_HOSTS}"
    for raw_host in "${RAW_HOSTS[@]}"; do
        host="$(printf '%s' "$raw_host" | xargs)"
        add_unique_host "$host"
    done
else
    add_unique_host "localhost"
    add_unique_host "127.0.0.1"
    add_unique_host "${HOST_IP:-}"
    add_unique_host "${OFFICE_ADDIN_PUBLIC_HOST:-}"
    add_unique_host "${CARBONE_API_PUBLIC_HOST:-}"
fi

if [ "${#TLS_HOSTS[@]}" -eq 0 ]; then
    echo "❌ 未检测到任何证书主机，请设置 OFFICE_ADDIN_TLS_HOSTS 或 HOST_IP"
    exit 1
fi

COMMON_NAME="${TLS_HOSTS[0]}"
DNS_INDEX=1
IP_INDEX=1
ALT_NAMES=""

for host in "${TLS_HOSTS[@]}"; do
    if printf '%s' "$host" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        ALT_NAMES="${ALT_NAMES}IP.${IP_INDEX} = ${host}\n"
        IP_INDEX=$((IP_INDEX + 1))
    else
        ALT_NAMES="${ALT_NAMES}DNS.${DNS_INDEX} = ${host}\n"
        DNS_INDEX=$((DNS_INDEX + 1))
    fi
done

cat > "$TMP_CONFIG" <<EOF
[ req ]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = req_distinguished_name
x509_extensions    = v3_req

[ req_distinguished_name ]
C  = CN
ST = Shanghai
L  = Shanghai
O  = Carbone
OU = Addin
CN = ${COMMON_NAME}

[ v3_req ]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ alt_names ]
$(printf '%b' "$ALT_NAMES")
EOF

echo "生成自签名 TLS 证书..."
echo "SAN hosts: ${TLS_HOSTS[*]}"

openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.crt" \
    -days "${CERT_DAYS:-365}" \
    -nodes \
    -config "$TMP_CONFIG" \
    -extensions v3_req

chmod 600 "$CERTS_DIR/server.key"
chmod 644 "$CERTS_DIR/server.crt"

echo "证书生成完成:"
echo "  - $CERTS_DIR/server.crt"
echo "  - $CERTS_DIR/server.key"
echo ""
echo "当前脚本生成的是自签名服务器证书，请信任 server.crt。"
echo "MacOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERTS_DIR/server.crt"
echo "Windows: certutil -addstore -f Root \"$CERTS_DIR/server.crt\""
echo ""
echo "最佳实践:"
echo "  1. 将 localhost、127.0.0.1、当前局域网 IP、稳定开发域名都加入 OFFICE_ADDIN_TLS_HOSTS"
echo "  2. 团队协作优先使用公司内部 CA 或 mkcert 等本地开发 CA 给 server.crt 签发证书"
echo "  3. 若切换为 CA 签发证书，请分发并信任根 CA，而不是继续分发旧的 server.crt"
