"""
Built-in execution tools and dispatcher for DeepSeek Harness (dsh).
Coordinates web retrieval, office parsing, workspace file manipulation, and shell execution.
"""

import os
import sys
import json
import time
import subprocess
import copy
from typing import Optional, Dict, Any
from pathlib import Path

from .config import WORKSPACE_DIR, PLUGIN_DIR
from .skills import read_skill

# Re-export submodules for 100% backward compatibility
from .web_tools import (
    CITY_PINYIN,
    check_deadline,
    assert_not_timed_out,
    fetch_weather,
    fetch_page,
    extract_query_freshness,
    normalize_search_query,
    perform_web_search,
)

from .office_tools import (
    extract_docx_text,
    extract_xlsx_text,
    extract_pdf_text,
    extract_pptx_text,
)

from .file_tools import (
    scan_personal_knowledge,
    inspect_image,
    read_workspace_file,
    patch_workspace_file,
    send_workspace_file,
)

from .reminder_tools import (
    create_personal_reminders,
)

SANDBOX_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "weather",
            "description": "查询指定城市或地区的实时气象、气温、风力及多日天气预报",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市中文名称或拼音，例如 '北京', '上海', '深圳', 'Guangzhou'"
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "使用联网搜索引擎检索实时新闻、事实数据、最新热点及技术文档",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词或短语"
                    },
                    "freshness": {
                        "type": "string",
                        "enum": ["day", "week", "month", "year"],
                        "description": "可选时间窗口硬过滤：day(近1天), week(近1周), month(近30天/1月), year(近1年)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_page",
            "description": "读取并提取公开网页或 URL 的正文内容（Markdown 格式）",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "网页 URL 地址，例如 'https://example.com'"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取沙箱工作区或知识库中的文件内容（支持代码文件、文本、markdown、docx、xlsx、pptx、pdf、json 等，支持行号切片查看大文件）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "文件路径或文件名，例如 'report.md' 或 'src/index.ts'"
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "起始行号（可选，从1开始计数，用于分片读取长文件）"
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "结束行号（可选，包含该行，用于分片读取长文件）"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "patch_file",
            "description": "对沙箱工作区中的文本或代码文件进行精准局部替换修改（无需全量重写文件，杜绝大文件截断与写坏）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "待修改的文件路径或文件名"
                    },
                    "target_text": {
                        "type": "string",
                        "description": "待替换的目标原文本（需精确匹配原文内容，包含换行与缩进）"
                    },
                    "replacement_text": {
                        "type": "string",
                        "description": "替换后的新文本内容"
                    }
                },
                "required": ["file_path", "target_text", "replacement_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "在沙箱隔离 Linux 环境执行 Shell 命令行指令（如 python3, curl, jq, git, cat 等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "cmd": {
                        "type": "string",
                        "description": "要执行的 Shell 命令行指令"
                    }
                },
                "required": ["cmd"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "scan_knowledge",
            "description": "扫描并读取挂载的个人知识库 (/knowledge) 中的参考文档与记忆",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_skill",
            "description": "读取系统专业技能指南或 PPT 设计规范模板",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "技能名称，例如 'guizang-ppt'"
                    }
                },
                "required": ["skill_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_file",
            "description": "将沙箱生成的文件直接推送/发送到用户的即时通讯（微信/网页）客户端",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要发送的文件路径或文件名"
                    },
                    "comment": {
                        "type": "string",
                        "description": "发送给用户的留言或说明"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vision_inspect",
            "description": "检查并深度分析沙箱工作区或知识库中的图片视觉内容（支持 png, jpg, jpeg, webp 等图片 OCR、排版与视觉理解）",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "待分析的图片文件名或路径，例如 'screenshot.png' 或 'diagram.jpg'"
                    },
                    "prompt": {
                        "type": "string",
                        "description": "针对该图片的具体分析指令或问题"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "image_gen",
            "description": "使用生图插件/生图模型生成或编辑图片文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "详细的生图或修图英文/中文提示词"
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "description": "生成图片的宽高比，如 '16:9', '1:1', '4:3', '9:16' 等"
                    },
                    "output_filename": {
                        "type": "string",
                        "description": "期望保存的图片文件名，例如 'hero_banner.png'"
                    }
                },
                "required": ["prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_reminders",
            "description": "为用户创建单次或多个定时/定期日程与提醒事项（如观看赛事、会议开会、运维点检、待办等）。根据上下文给出的具体日期、时间和项目，自动提取并计算准确的未来时间（ISO 8601格式，默认 Asia/Shanghai 时区）并创建提醒。已连接微信时默认同步微信推送。",
            "parameters": {
                "type": "object",
                "properties": {
                    "reminders": {
                        "type": "array",
                        "description": "待创建的提醒事项列表",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "提醒标题，简要概括事项，例如 'WSBK WorldSSP300 排位赛'"
                                },
                                "message": {
                                    "type": "string",
                                    "description": "提醒详细内容与说明，例如 'WSBK WorldSSP300 排位赛（决定发车位）即将开始，比赛时间 19:10 - 19:35'"
                                },
                                "run_at": {
                                    "type": "string",
                                    "description": "一次性提醒的未来时间（ISO 8601 格式，例如 '2026-09-25T19:10:00+08:00' 或提前5分钟 '2026-09-25T19:05:00+08:00'）"
                                },
                                "cron_expression": {
                                    "type": "string",
                                    "description": "循环提醒的五段式 Cron 表达式（可选，如 '0 9 * * 1-5'，与 run_at 二选一）"
                                },
                                "send_wechat": {
                                    "type": "boolean",
                                    "description": "是否同步发送至微信。已配置微信时默认为 true"
                                }
                            },
                            "required": ["title", "message"]
                        }
                    }
                },
                "required": ["reminders"]
            }
        }
    }
]


def get_sandbox_tools(available_skills: Optional[list] = None) -> list:
    """Returns sandbox tools with dynamically enriched read_skill schema based on registered skills."""
    tools = copy.deepcopy(SANDBOX_TOOLS)
    try:
        if available_skills is None:
            from .skills import get_available_skills
            available_skills = get_available_skills()
        skill_ids = [s["id"] for s in available_skills if isinstance(s, dict) and "id" in s]
        if skill_ids:
            for t in tools:
                fn = t.get("function", {})
                if fn.get("name") == "read_skill":
                    props = fn.get("parameters", {}).get("properties", {}).get("skill_name", {})
                    props["enum"] = skill_ids
                    props["description"] = f"待读取的技能标识，系统当前已注册: {', '.join(skill_ids)}"
                    break
    except Exception:
        pass
    return tools


def execute_tool(tool_name: str, params: dict, deadline: Optional[float] = None) -> str:
    """Executes the requested tool inside sandbox or network scraper, bound by task deadline"""
    if deadline is not None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Task total execution deadline exceeded before tool invocation")
    else:
        remaining = None

    name_clean = tool_name.strip().lower()
    res = ""

    if name_clean in ["weather", "get_weather", "query_weather"]:
        city = (
            params.get("city") or
            params.get("location") or
            params.get("query") or
            (str(list(params.values())[0]) if params else "上海")
        )
        res = fetch_weather(str(city), deadline=deadline)

    elif name_clean in ["web_search", "search", "google_search", "bing_search", "modsearch"]:
        query = (
            params.get("__search_query") or
            params.get("query") or
            params.get("q") or
            params.get("search_query") or
            params.get("keyword") or
            ""
        )
        if not query and params:
            query = str(list(params.values())[0])
        freshness = params.get("freshness") or params.get("time_range") or params.get("time_window")
        res = perform_web_search(query, freshness=freshness, deadline=deadline)

    elif name_clean in ["fetch_page", "read_url", "web_fetch", "curl_page", "browse", "get_page", "page_fetch"]:
        url = (
            params.get("url") or
            params.get("link") or
            params.get("href") or
            (str(list(params.values())[0]) if params else "")
        )
        res = fetch_page(str(url), deadline=deadline)

    elif name_clean in ["read_file", "cat", "view_file", "read_doc", "parse_file", "open_file", "read"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            params.get("name") or
            (str(list(params.values())[0]) if params else "")
        )
        s_line = params.get("start_line") or params.get("start") or params.get("offset")
        e_line = params.get("end_line") or params.get("end") or params.get("limit")
        try:
            s_val = int(s_line) if s_line is not None else None
        except (ValueError, TypeError):
            s_val = None
        try:
            e_val = int(e_line) if e_line is not None else None
        except (ValueError, TypeError):
            e_val = None
        res = read_workspace_file(str(fpath), start_line=s_val, end_line=e_val, deadline=deadline)

    elif name_clean in ["patch_file", "replace_content", "patch", "edit_file", "replace_in_file"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            ""
        )
        target_text = (
            params.get("target_text") or
            params.get("target") or
            params.get("old_text") or
            params.get("match") or
            ""
        )
        replacement_text = (
            params.get("replacement_text")
            if "replacement_text" in params
            else params.get("replacement", params.get("new_text", ""))
        )
        res = patch_workspace_file(str(fpath), str(target_text), str(replacement_text))

    elif name_clean in ["vision_inspect", "inspect_image", "image_inspect", "read_image", "ocr", "view_image", "analyze_image"]:
        fpath = (
            params.get("file_path") or
            params.get("image_path") or
            params.get("path") or
            params.get("file") or
            params.get("filename") or
            (str(list(params.values())[0]) if params else "")
        )
        prompt = params.get("prompt") or params.get("instruction") or params.get("query") or ""
        res = inspect_image(str(fpath), prompt, deadline=deadline)

    elif name_clean in ["bash", "cmd", "terminal", "sh", "exec"]:
        cmd = params.get("cmd") or params.get("command") or ""
        if not cmd and params:
            cmd = str(list(params.values())[0])
        bash_max = float(os.getenv("DSH_BASH_TIMEOUT", "60.0"))
        bash_to = max(0.5, min(bash_max, remaining)) if remaining is not None else bash_max
        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=WORKSPACE_DIR if os.path.exists(WORKSPACE_DIR) else None,
                text=True,
                capture_output=True,
                timeout=bash_to
            )
            out = proc.stdout.strip()
            err = proc.stderr.strip()
            if proc.returncode != 0:
                combined_err = f"{err}\n{out}"
                diag = ""
                if "ModuleNotFoundError" in combined_err or "No module named" in combined_err:
                    diag = "[系统自愈提示]: 检测到 Python 缺少依赖模块，请调用 bash 执行 `pip install <模块名>` 安装依赖后再重试。"
                elif "FileNotFoundError" in combined_err or "No such file or directory" in combined_err:
                    diag = "[系统自愈提示]: 检测到目标文件或路径不存在，请先调用 bash 执行 `ls -la` 检查工作区实际文件路径。"
                elif "SyntaxError" in combined_err:
                    diag = "[系统自愈提示]: 检测到代码语法错误，请检查对应文件行代码并修正。"
                elif "Permission denied" in combined_err:
                    diag = "[系统自愈提示]: 权限不足，请确认文件读写权限或是否使用了正确的非 root 用户权限。"

                parts = [f"[命令执行失败，退出码 {proc.returncode}]"]
                if err:
                    parts.append(f"STDERR:\n{err}")
                if out:
                    parts.append(f"STDOUT:\n{out}")
                if diag:
                    parts.append(diag)
                res = "\n\n".join(parts)
            else:
                res = out or err or "(命令执行完成，返回退出码 0)"
        except subprocess.TimeoutExpired:
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Task total execution deadline exceeded during bash command")
            res = (
                f"⚠️ [命令执行超时 ({bash_to:.1f}s)]: `{cmd[:80]}`\n"
                f"💡 [优化建议]: 该命令执行耗时超过了限制（{bash_to:.1f}s），请检查是否存在交互式输入阻塞（如 apt/pip 缺少 -y）、网络下载慢或死循环，建议将复杂逻辑拆分处理。"
            )
        except Exception as e:
            res = f"命令执行异常: {e}"

    elif name_clean in ["knowledge_search", "scan_knowledge"]:
        res = scan_personal_knowledge()

    elif name_clean in ["read_skill", "get_skill", "load_skill", "use_skill", "skill"]:
        skill_name = (
            params.get("skill_name") or
            params.get("name") or
            params.get("skill") or
            (str(list(params.values())[0]) if params else "")
        )
        res = read_skill(skill_name)

    elif name_clean in ["send_file", "send_workspace_file", "send_to_user", "send_to_wechat", "send_document", "deliver_file", "push_file"]:
        fpath = (
            params.get("file_path") or
            params.get("file") or
            params.get("path") or
            params.get("filename") or
            params.get("name") or
            (str(list(params.values())[0]) if params else "")
        )
        comment = params.get("comment") or params.get("desc") or params.get("message") or ""
        res = send_workspace_file(str(fpath), str(comment))

    elif name_clean in ["image_gen", "generate_image", "text_to_image", "draw_image", "paint"]:
        plugin_file = Path(PLUGIN_DIR) / "image_gen.py"
        if plugin_file.exists():
            gen_to = max(1.0, min(35.0, remaining)) if remaining is not None else 35.0
            try:
                proc = subprocess.run(
                    [sys.executable, str(plugin_file), json.dumps(params)],
                    text=True,
                    capture_output=True,
                    timeout=gen_to
                )
                res = proc.stdout.strip() or proc.stderr.strip()
            except subprocess.TimeoutExpired:
                if deadline is not None and time.monotonic() >= deadline:
                    raise TimeoutError("Task total execution deadline exceeded during image generation")
                res = f"生图执行超时 ({gen_to:.1f}s)"
            except Exception as e:
                res = f"生图插件执行异常: {e}"
        else:
            res = "【系统提示】当前对话模型具备多模态视觉理解能力（支持识图分析），但不支持原生图像生成/绘图（Text-to-Image）。如需生成图片文件，需在平台接入生图模型（如 Imagen / DALL-E / Flux / ComfyUI）。"

    elif name_clean in [
        "create_reminders", "create_reminder", "set_reminder", "set_reminders",
        "add_reminder", "add_reminders", "remind", "reminder"
    ]:
        res = create_personal_reminders(**params)

    else:
        plugin_file = Path(PLUGIN_DIR) / f"{tool_name}.py"
        if plugin_file.exists():
            plug_to = max(0.5, min(20.0, remaining)) if remaining is not None else 20.0
            try:
                proc = subprocess.run(
                    [sys.executable, str(plugin_file), json.dumps(params)],
                    text=True,
                    capture_output=True,
                    timeout=plug_to
                )
                res = proc.stdout.strip() or proc.stderr.strip()
            except subprocess.TimeoutExpired:
                if deadline is not None and time.monotonic() >= deadline:
                    raise TimeoutError(f"Task total execution deadline exceeded during plugin {tool_name}")
                res = f"插件执行超时 ({plug_to:.1f}s): {tool_name}"
            except Exception as e:
                res = f"插件执行异常: {e}"
        else:
            res = f"未识别工具名称: {tool_name}"

    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError(f"Task total execution deadline exceeded after tool {tool_name}")

    return res
