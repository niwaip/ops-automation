"""Bash execution and diagnostics, with pipeline failures preserved."""
import os
import re
import shutil
import signal
import subprocess
import threading
import time

from .tool_result import ToolResult, TextToolOutput


def execute_shell(cmd, workspace, deadline=None, *, _allow_pdf_recovery=True):
    remaining = deadline - time.monotonic() if deadline is not None else None
    if remaining is not None and remaining <= 0:
        raise TimeoutError("Task total execution deadline exceeded before bash command")
    failed = False
    exit_code = None
    timed_out = False
    # 兼容性自愈垫片：若环境未配置 python 别名但存在 python3，将命令中的 python 安全映射为 python3
    if shutil.which("python") is None and shutil.which("python3") is not None:
        cmd = re.sub(r'(^|[;&|]\s*)python\b', r'\1python3', cmd)
    bash_max = float(os.getenv("DSH_BASH_TIMEOUT", "60.0"))
    # 自适应超时：针对重型文档本地化/翻译/多媒体生成，或显式带 timeout 声明的命令，动态放宽超时限制
    is_heavy_task = bool(re.search(r'(?:ooxml|flow).*translate|render_(?:docx|pdf|spreadsheet)', cmd))
    m_timeout = re.search(r'\btimeout\s+(\d+)\b', cmd)
    if is_heavy_task:
        heavy_timeout = float(os.getenv("DSH_HEAVY_BASH_TIMEOUT", "1800.0"))
        bash_max = max(bash_max, heavy_timeout)
    if m_timeout:
        cmd_timeout = float(m_timeout.group(1))
        bash_max = max(bash_max, cmd_timeout + 5.0)
    from .pdf_translation_workflow import reusable_candidate
    reused = reusable_candidate(cmd, workspace)
    if reused is not None:
        return TextToolOutput(reused.render_text(), reused)
    if _allow_pdf_recovery:
        from .pdf_translation_recovery import exhausted_recovery
        exhausted = exhausted_recovery(cmd, workspace)
        if exhausted:
            return TextToolOutput(exhausted.render_text(), exhausted)
    from .pdf_translation_bridge import prepare_pdf_translation
    pdf_job = prepare_pdf_translation(cmd, workspace, deadline)
    if pdf_job is None:
        from pathlib import Path
        from .config import SKILL_DIR
        from .pdf_translation_command import invokes_installed_cli
        if invokes_installed_cli(cmd, workspace, Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py'):
            result = ToolResult.error('invalid_arguments',
                'PDF命令参数或shell包装不受支持；请单独调用auto/unpack/pack。'
                '恢复仅用--resume和工具回执中的resume_dir；不要附加echo、分号或其他命令掩盖退出状态。',
                provenance={'tool': 'bash'})
            return TextToolOutput(result.render_text(), result)
    if pdf_job:
        bash_max = pdf_job.timeout
    bash_to = max(0.5, min(bash_max, remaining)) if remaining is not None else bash_max
    proc = None
    try:
        proc = subprocess.Popen(
            ["/bin/bash", "-o", "pipefail", "-c", cmd],
            cwd=workspace if os.path.exists(workspace) else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            preexec_fn=os.setsid,
            env=pdf_job.environment() if pdf_job else None,
        )

        stdout_lines = []
        stderr_lines = []

        def _read_pipe(pipe, collector, is_stdout=True):
            try:
                for line in iter(pipe.readline, ''):
                    collector.append(line)
                    if is_stdout:
                        trimmed = line.strip()
                        if trimmed and any(trimmed.startswith(prefix) for prefix in (
                            "🔍", "✓", "⚡", "✨", "📝", "🌐", "🎯", "⏳", "🧠"
                        )):
                            cleaned_lead = re.sub(r'^\s*✓', '✓', trimmed)
                            print(cleaned_lead, flush=True)
                            print("<<<DSH_PROGRESS>>>", flush=True)
            except Exception:
                pass
            finally:
                try:
                    pipe.close()
                except Exception:
                    pass

        t_out = threading.Thread(target=_read_pipe, args=(proc.stdout, stdout_lines, True))
        t_err = threading.Thread(target=_read_pipe, args=(proc.stderr, stderr_lines, False))
        t_out.daemon = True
        t_err.daemon = True
        t_out.start()
        t_err.start()

        start_t = time.monotonic()
        while proc.poll() is None:
            if pdf_job:
                pdf_job.poll()
            if time.monotonic() - start_t > bash_to:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                t_out.join(timeout=0.5)
                t_err.join(timeout=0.5)
                raise subprocess.TimeoutExpired(cmd, bash_to)
            time.sleep(0.05)

        t_out.join(timeout=2.0)
        t_err.join(timeout=2.0)

        out = "".join(stdout_lines).strip()
        err = "".join(stderr_lines).strip()
        exit_code = proc.returncode
        if proc.returncode != 0:
            failed = True
            combined_err = f"{err}\n{out}"
            diag = ""
            if "engine_not_enabled" in combined_err:
                diag = (
                    "[系统致命错误 - 引擎未启用]: PDF 布局翻译引擎尚未完成生产环境启用 (engine_not_enabled)。\n"
                    "该功能在当前运行环境中已明确关闭，不可在本轮通过任何替代脚本或命令修复。\n"
                    "【严重警告】严禁通过搜索、复制、重命名历史旧文件或生成假文件冒充本轮交付物！\n"
                    "请立即停止所有尝试，如实向用户说明 PDF 布局翻译引擎尚未启用并结束本轮对话。"
                )
            elif "python: not found" in combined_err or "python: command not found" in combined_err:
                diag = "[系统自愈提示]: 检测到系统未找到 `python` 指令，当前沙箱默认 Python 解释器为 `python3`。请在 bash 指令中使用 `python3` 执行脚本。"
            elif "ModuleNotFoundError" in combined_err or "No module named" in combined_err:
                if any(f"No module named '{module}'" in combined_err for module in ('pptx', 'docx', 'openpyxl', 'xlsxwriter', 'PIL', 'pypdf')):
                    diag = "[运行时依赖错误]: 沙箱镜像缺少声明预装的办公依赖，请报告需要更新镜像；不要反复安装或擅自更换交付格式。"
                else:
                    diag = "[系统自愈提示]: 请先确认缺少的模块名称，再使用隔离的虚拟环境安装依赖后重试。"
            elif "AttributeError" in combined_err and ("rFonts" in combined_err or "rPr" in combined_err):
                diag = (
                    "[系统自愈提示]: 检测到 python-docx 样式底层属性未初始化错误 ('NoneType' object has no attribute 'rFonts')。\n"
                    "严禁直接裸调 `doc.styles['Normal'].element.rPr.rFonts`！\n"
                    "正确修复方式：必须先设置 `doc.styles['Normal'].font.name = 'Microsoft YaHei'` 初始化底层属性，"
                    "或者使用 `doc.styles['Normal'].element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'Microsoft YaHei')`，"
                    "或者直接在 Run 级别设置 `run.font.name = 'Microsoft YaHei'`。请立即调用 bash 修改脚本并重新执行！"
                )
            elif "FileNotFoundError" in combined_err or "No such file or directory" in combined_err or "没有那个文件或目录" in combined_err:
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
        failed = True
        timed_out = True
        if deadline is not None and time.monotonic() >= deadline:
            if pdf_job:
                pdf_job.finish(True, 'Task total execution deadline exceeded during PDF translation')
            raise TimeoutError("Task total execution deadline exceeded during bash command")
        if 'flow_pdf_translate.py' in cmd:
            opt_tip = f"💡 [文档耗时提示]: 该PDF文档页面较多或版式内容复杂，处理耗时超出当前批次限时（{bash_to:.1f}s）。系统已保留已解析页面检查点，可直接发起重试或继续恢复执行。"
        elif re.search(r'ooxml.*translate', cmd):
            opt_tip = f"💡 [文档耗时提示]: 该Office文档包含较多文本项，处理耗时超出当前批次限时（{bash_to:.1f}s）。系统已保留已完成翻译项检查点，可直接再次执行命令继续断点续译完成。"
        else:
            opt_tip = f"💡 [优化建议]: 该命令执行耗时超过了限制（{bash_to:.1f}s），请检查是否存在交互式输入阻塞（如 apt/pip 缺少 -y）、网络下载慢或死循环，建议将复杂逻辑拆分处理。"
        res = (
            f"⚠️ [命令执行超时 ({bash_to:.1f}s)]: `{cmd[:80]}`\n"
            f"{opt_tip}"
        )
    except Exception as e:
        failed = True
        res = f"命令执行异常: {e}"
    finally:
        if proc is not None and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        if pdf_job:
            pdf_job.poll()

    err_code = 'shell_command_failed'
    if failed and 'engine_not_enabled' in res:
        err_code = 'engine_not_enabled'
    result = (ToolResult.error(err_code, res, provenance={'tool': 'bash'},
                              error_details={'exit_code': exit_code})
              if failed else ToolResult.success(res, provenance={'tool': 'bash'}))
    if pdf_job:
        result = pdf_job.finish(failed, res,
            error_code='budget_exhausted' if timed_out or exit_code == 124 else None)
        if _allow_pdf_recovery:
            from .pdf_translation_recovery import recover_pdf_translation
            result = recover_pdf_translation(result, pdf_job, cmd, workspace, deadline,
                lambda command: execute_shell(command, workspace, deadline, _allow_pdf_recovery=False))
    return TextToolOutput(result.render_text(), result)
