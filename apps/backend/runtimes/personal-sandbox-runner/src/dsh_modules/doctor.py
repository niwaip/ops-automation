"""
DeepSeek Harness (dsh) - Environment & Health Diagnostics (Doctor)
Performs comprehensive self-testing for Python packages, system CLI tools,
sandbox paths, and network gateways.
"""

import sys
import os
import shutil
import socket
import urllib.request
from pathlib import Path
from typing import List, Dict, Any, Tuple

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, SKILL_DIR, PLUGIN_DIR, DEFAULT_PROXY_URL


def check_python_modules() -> List[Dict[str, Any]]:
    """Checks required and optional Python packages in the sandbox runtime."""
    modules_to_test = [
        ("docx", "python-docx", True, "Word 文档读写与批注修订"),
        ("openpyxl", "openpyxl", True, "Excel 表格读写与公式重算"),
        ("pypdf", "pypdf", True, "PDF 文档解析与页面提取"),
        ("pptx", "python-pptx", True, "PowerPoint 演示文稿生成"),
        ("fitz", "PyMuPDF", False, "PDF 高保真表单与渲染提取"),
        ("requests", "requests", False, "HTTP 高级网络客户端"),
        ("playwright", "playwright", False, "浏览器端到端无头自动化")
    ]
    results = []
    for mod_name, pkg_name, required, desc in modules_to_test:
        try:
            __import__(mod_name)
            results.append({
                "category": "Python 核心依赖",
                "name": pkg_name,
                "status": "PASS",
                "required": required,
                "detail": f"{desc} (可用)"
            })
        except ImportError:
            status = "FAIL" if required else "WARN"
            results.append({
                "category": "Python 核心依赖",
                "name": pkg_name,
                "status": status,
                "required": required,
                "detail": f"{desc} (未安装，请执行 pip install {pkg_name})"
            })
    return results


def check_system_binaries() -> List[Dict[str, Any]]:
    """Checks essential command-line tools in system PATH."""
    binaries = [
        ("python3", True, "Python 3 运行解释器"),
        ("soffice", False, "LibreOffice CLI 无头转换引擎"),
        ("pdftoppm", False, "Poppler PDF 栅格化工具 (用于视觉检查)"),
        ("curl", False, "系统命令行 HTTP 客户端"),
        ("git", False, "版本控制工具")
    ]
    results = []
    for bin_name, required, desc in binaries:
        path = shutil.which(bin_name)
        if path:
            results.append({
                "category": "系统命令引擎",
                "name": bin_name,
                "status": "PASS",
                "required": required,
                "detail": f"{desc} ({path})"
            })
        else:
            status = "FAIL" if required else "WARN"
            results.append({
                "category": "系统命令引擎",
                "name": bin_name,
                "status": status,
                "required": required,
                "detail": f"{desc} (PATH 中未找到)"
            })
    return results


def check_paths_and_permissions() -> List[Dict[str, Any]]:
    """Checks filesystem paths, mounts, and read/write permissions."""
    paths_to_check = [
        (WORKSPACE_DIR, True, "用户工作区目录 (/workspace)", True),
        (KNOWLEDGE_DIR, True, "用户个人空间与知识库 (/knowledge)", True),
        (SKILL_DIR, False, "平台预置技能库 (/opt/dsh/skills)", False),
        (PLUGIN_DIR, False, "平台系统插件目录 (/opt/dsh/plugins)", False)
    ]
    results = []
    for p_str, required, desc, need_write in paths_to_check:
        p = Path(p_str)
        if not p.exists():
            status = "WARN" if not required else ("WARN" if not os.environ.get("DOCKER_CONTAINER") else "FAIL")
            results.append({
                "category": "沙箱路径挂载",
                "name": p_str,
                "status": status,
                "required": required,
                "detail": f"{desc} 不存在"
            })
            continue

        readable = os.access(p, os.R_OK)
        writable = os.access(p, os.W_OK) if need_write else True

        if readable and writable:
            results.append({
                "category": "沙箱路径挂载",
                "name": p_str,
                "status": "PASS",
                "required": required,
                "detail": f"{desc} 权限正常 (读写可用)"
            })
        else:
            results.append({
                "category": "沙箱路径挂载",
                "name": p_str,
                "status": "FAIL",
                "required": required,
                "detail": f"{desc} 权限受限 (可读={readable}, 可写={writable})"
            })
    return results


def check_connectivity() -> List[Dict[str, Any]]:
    """Checks network DNS and gateway connectivity."""
    results = []

    # 1. DNS Resolution
    try:
        socket.gethostbyname("bing.com")
        results.append({
            "category": "通信与网络通道",
            "name": "DNS 解析",
            "status": "PASS",
            "required": False,
            "detail": "公网域名解析正常"
        })
    except Exception as e:
        results.append({
            "category": "通信与网络通道",
            "name": "DNS 解析",
            "status": "WARN",
            "required": False,
            "detail": f"公网 DNS 解析异常 (离线或无外网): {e}"
        })

    # 2. Model Proxy Gateway
    proxy_url = DEFAULT_PROXY_URL
    try:
        req = urllib.request.Request(proxy_url, method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            code = resp.status
        results.append({
            "category": "通信与网络通道",
            "name": "模型代理网关",
            "status": "PASS",
            "required": True,
            "detail": f"响应就绪 ({proxy_url}, HTTP {code})"
        })
    except urllib.error.HTTPError as e:
        # 4xx 客户端响应码（如 400, 401, 403, 404, 405 等）表明 HTTP 代理网关在第 7 层存活并积极响应请求
        # 5xx 服务端错误（如 500, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout）表明网关崩溃或上游连接失败
        if 400 <= e.code < 500:
            results.append({
                "category": "通信与网络通道",
                "name": "模型代理网关",
                "status": "PASS",
                "required": True,
                "detail": f"网关就绪 ({proxy_url}, HTTP {e.code} 存活响应)"
            })
        else:
            results.append({
                "category": "通信与网络通道",
                "name": "模型代理网关",
                "status": "FAIL",
                "required": True,
                "detail": f"网关服务故障 ({proxy_url}, HTTP {e.code}): 服务端内部错误或上游模型服务不可用"
            })
    except Exception as e:
        # 连接被拒 (Connection refused)、超时、无法解析网关主机名等，沙箱大模型核心通道完全不可用
        results.append({
            "category": "通信与网络通道",
            "name": "模型代理网关",
            "status": "FAIL",
            "required": True,
            "detail": f"网关无法连接 ({proxy_url}): {e}"
        })

    return results


def run_doctor_checks() -> Tuple[bool, List[Dict[str, Any]]]:
    """Runs all health checks and returns overall healthy boolean and check details."""
    all_checks = []
    all_checks.extend(check_python_modules())
    all_checks.extend(check_system_binaries())
    all_checks.extend(check_paths_and_permissions())
    all_checks.extend(check_connectivity())

    has_critical_failure = any(
        c["status"] == "FAIL" and c.get("required", True) for c in all_checks
    )
    return (not has_critical_failure), all_checks


def cmd_doctor(args=None):
    """CLI Entry point for `dsh doctor`."""
    print("=" * 64)
    print("   🏥 DeepSeek Harness (dsh) 沙箱环境健康诊断报告 (Doctor)")
    print("=" * 64)

    is_healthy, checks = run_doctor_checks()

    current_cat = ""
    for c in checks:
        if c["category"] != current_cat:
            current_cat = c["category"]
            print(f"\n【{current_cat}】")

        if c["status"] == "PASS":
            mark = "  ✓ [PASS]"
        elif c["status"] == "WARN":
            mark = "  ! [WARN]"
        else:
            mark = "  ✗ [FAIL]"

        print(f"{mark} {c['name']:<18} : {c['detail']}")

    print("\n" + "-" * 64)
    has_warnings = any(c["status"] == "WARN" for c in checks)
    if not is_healthy:
        print("  ⚠️ 整体健康状态: 存在异常 (部分关键依赖未就绪，请参考上述提示修复)")
    elif has_warnings:
        print("  💡 整体健康状态: 良好 (沙箱所有核心功能均正常运作，部分可选扩展未就绪)")
    else:
        print("  🎉 整体健康状态: 优秀 (沙箱所有核心及扩展功能均就绪)")
    print("-" * 64 + "\n")
    return 0 if is_healthy else 1
