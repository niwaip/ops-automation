"""
SSRF Protection and Secure Network Utilities for DeepSeek Harness (dsh).
Provides host validation, DNS-rebinding pinned connections, and safe redirect handlers.
"""

import socket
import ipaddress
import urllib.parse
import urllib.request
import urllib.error
import http.client
import sys
from typing import Tuple

FORBIDDEN_HOSTS = {
    'localhost',
    'metadata.google.internal',
    'instance-data',
    '169.254.169.254',
    'ops-postgres',
    'ops-redis',
    'ops-platform',
    'ops-session-broker',
    'ops-control-plane',
    'ops-ai-orchestrator',
    'session-broker',
    'control-plane',
    'platform',
    'ai-orchestrator',
}

MAX_FETCH_RESPONSE_BYTES = 5 * 1024 * 1024  # 5MB 响应读取硬上限


def resolve_and_validate_destination(host: str, port: int) -> Tuple[bool, str]:
    """
    Resolves host and verifies that resolved IP does not fall into forbidden/private/loopback ranges.
    Returns (True, safe_ip_str) or (False, error_reason).
    """
    clean_host = (host or '').strip().lower()
    if not clean_host:
        return False, "缺少主机名"

    if clean_host in FORBIDDEN_HOSTS or clean_host.endswith('.internal') or clean_host.endswith('.local'):
        return False, f"禁止访问内部网络或云元数据服务: {clean_host}"

    try:
        addr_info = socket.getaddrinfo(clean_host, port, proto=socket.IPPROTO_TCP)
    except Exception as dns_err:
        return False, f"无法解析目标主机: {dns_err}"

    if not addr_info:
        return False, f"无法解析目标域名: {clean_host}"

    for item in addr_info:
        ip_str = item[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False, f"禁止访问私有内网或元数据地址 ({ip_str})"
        except ValueError:
            return False, f"无效的 IP 地址: {ip_str}"

    return True, addr_info[0][4][0]


def is_safe_web_url(url: str) -> Tuple[bool, str]:
    """SSRF 校验：检查 URL 协议及目标 IP 是否属于私网、回环、保留地址或云元数据地址"""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False, f"不支持的 URL 协议: {parsed.scheme}，仅允许 http 与 https"

        hostname = (parsed.hostname or '').strip().lower()
        if not hostname:
            return False, "无效的 URL: 缺少主机名"

        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        safe, ip_or_err = resolve_and_validate_destination(hostname, port)
        if not safe:
            return False, ip_or_err
        return True, ""
    except Exception as e:
        return False, f"URL 解析或安全检查失败: {e}"


class SSRFPinnedHTTPConnection(http.client.HTTPConnection):
    """Pins socket connection directly to pre-validated IP to eliminate DNS rebinding attacks"""
    def connect(self):
        sys.audit("http.client.connect", self, self.host, self.port)
        safe, ip_or_err = resolve_and_validate_destination(self.host, self.port)
        if not safe:
            raise OSError(f"SSRF Blocked: {ip_or_err}")
        self.sock = self._create_connection(
            (ip_or_err, self.port), self.timeout, self.source_address
        )
        try:
            self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        if self._tunnel_host:
            self._tunnel()


class SSRFPinnedHTTPSConnection(http.client.HTTPSConnection):
    """Pins socket connection directly to pre-validated IP and performs SNI/cert verification with host"""
    def connect(self):
        safe, ip_or_err = resolve_and_validate_destination(self.host, self.port)
        if not safe:
            raise OSError(f"SSRF Blocked: {ip_or_err}")
        self.sock = self._create_connection(
            (ip_or_err, self.port), self.timeout, self.source_address
        )
        try:
            self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except OSError:
            pass
        server_hostname = self._tunnel_host if self._tunnel_host else self.host
        self.sock = self._context.wrap_socket(self.sock, server_hostname=server_hostname)


class SSRFHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(SSRFPinnedHTTPConnection, req)


class SSRFHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(
            SSRFPinnedHTTPSConnection,
            req,
            context=self._context,
            check_hostname=self._check_hostname
        )


class SSRFSafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """防止重定向跳转至内部网络或元数据服务的安全重定向处理器"""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe, err = is_safe_web_url(newurl)
        if not safe:
            raise urllib.error.HTTPError(newurl, 403, f"SSRF Blocked: {err}", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_limited_response(resp, max_bytes: int = MAX_FETCH_RESPONSE_BYTES) -> str:
    """分块读取 HTTP 响应并在达到字节上限时截断，防止大文件耗尽内存"""
    chunks = []
    total = 0
    while True:
        chunk = resp.read(64 * 1024)
        if not chunk or not isinstance(chunk, (bytes, bytearray)):
            break
        chunks.append(chunk)
        total += len(chunk)
        if total >= max_bytes:
            break
    return b"".join(chunks).decode("utf-8", errors="ignore")
