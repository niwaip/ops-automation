"""Best-effort recalc for new generated workbooks; success requires validation."""
import os
import sys
from pathlib import Path
from typing import Optional, List
from .workbook_delivery import inspect_generated_workbook

def recalculate_generated_workbooks(workspace_dir: str, turn_start_time: Optional[float] = None) -> List[str]:
    """
    对工作区中本轮新生成的带公式但缺少缓存值的 xlsx/xlsm 交付物执行无头重算以补齐公式缓存。
    确保 openpyxl (data_only=True) 与下游只读流中不出现 None。
    仅处理本轮新增/修改的文件，严禁改写受保护的用户输入附件。
    """
    recalculated = []
    try:
        from dsh_modules.workbook_calculation import has_uncalculated_formulas
        from dsh_modules.file_tools import is_protected_session_file

        recalc_module = None
        try:
            import recalc
            recalc_module = recalc
        except ImportError:
            candidates = [
                Path("/opt/dsh/skills/xlsx/scripts"),
                Path(__file__).resolve().parent.parent.parent / "skills/xlsx/scripts",
                Path("/workspace/skills/xlsx/scripts"),
                Path("skills/xlsx/scripts").resolve(),
            ]
            for cand in candidates:
                if (cand / "recalc.py").exists():
                    if str(cand) not in sys.path:
                        sys.path.insert(0, str(cand))
                    try:
                        import recalc
                        recalc_module = recalc
                        break
                    except Exception as e:
                        print(f"⚠️ [Harness Auto-Recalc] 导入 {cand}/recalc.py 异常: {e}", flush=True)

        if not recalc_module or not hasattr(recalc_module, "recalc"):
            return recalculated

        if not os.path.exists(workspace_dir):
            return recalculated

        mtime_threshold = (turn_start_time - 2.0) if turn_start_time else None

        for fname in os.listdir(workspace_dir):
            if fname.lower().endswith((".xlsx", ".xlsm")) and not fname.startswith("."):
                fpath = Path(workspace_dir) / fname
                if is_protected_session_file(fpath):
                    continue
                try:
                    from .spreadsheet_update.delivery import is_verified_update_file
                    if is_verified_update_file(fpath):
                        continue
                except Exception:
                    pass
                try:
                    if mtime_threshold and fpath.stat().st_mtime < mtime_threshold:
                        continue
                except OSError:
                    continue

                if has_uncalculated_formulas(fpath):
                    print(f"✨ [Harness Auto-Recalc] 检测到本轮生成表格 {fname} 包含未缓存公式，正在执行无头重算补齐缓存...", flush=True)
                    try:
                        res = recalc_module.recalc(str(fpath), output=str(fpath))
                        if not inspect_generated_workbook(fpath)["valid"]:
                            print(f"⚠️ [Harness Auto-Recalc] 表格 {fname} 重算未完成: {inspect_generated_workbook(fpath)['issues']}", flush=True)
                        else:
                            recalculated.append(str(fpath))
                            print(f"✓ [Harness Auto-Recalc] 表格 {fname} 公式重算与缓存填充完成", flush=True)
                    except Exception as err:
                        print(f"⚠️ [Harness Auto-Recalc] 表格 {fname} 重算过程抛出异常: {err}", flush=True)
    except Exception as e:
        print(f"⚠️ [Harness Auto-Recalc] 执行环境自检异常: {e}", flush=True)
    return recalculated

