"""Execute generic analysis plans against verified source values, without code generation."""

import hashlib
import json
import os
import re
import time
from zipfile import BadZipFile
from pathlib import Path
import openpyxl
from openpyxl.utils import get_column_letter
from .file_tools import resolve_sandboxed_path
from .tool_result import ToolResult, TextToolOutput
from .workbook_calculation import get_or_create_recalculated_workbook
from .spreadsheet_units import declared_amount_unit
from .spreadsheet_expression import ExpressionEvaluator, bounded_range, source_column, numeric, present_quantity
from .spreadsheet_quality import profiles, evaluate_rule
from .spreadsheet_scope import table_months, validate_caption
from .spreadsheet_checks import validate_source_identity
from .spreadsheet_plan import normalize_plan
from .analysis_semantics import domain_pack, runtime_domain, validate_domain_calculation, validate_metric_result
from .spreadsheet_semantic_bindings import semantic_bindings


def deadline_check(deadline):
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError("Spreadsheet analysis deadline exceeded")


def prepare_tables(plan, workbook, check, apply_filters=True):
    result = {}; cell_budget = 0
    for item in plan:
        check()
        if not isinstance(item, dict) or set(item)-{"id", "sheet", "data_range", "header_row", "filters"}:
            raise ValueError("非法数据表计划")
        if not {"id", "sheet", "data_range", "header_row"} <= set(item):
            raise ValueError("数据表计划缺少必要字段")
        ws = workbook[item["sheet"]]; bounds = bounded_range(ws, item["data_range"])
        a, start, b, end = bounds; header = item["header_row"]
        if isinstance(header, bool) or not isinstance(header, int) or not 1 <= header <= start:
            raise ValueError("表头必须在业务范围之前")
        header_values=[ws.cell(header,col).value for col in range(a,b+1)]
        if any(v is not None and (not isinstance(v,str) or v.startswith('=')) for v in header_values):
            raise ValueError("声明表头含数据或公式，需要明确的单层文本字段名")
        cell_budget += (end-start+1)*(b-a+1)
        if cell_budget > 200000:
            raise ValueError("合计业务范围超出预算")
        # Explicit header metadata is authoritative. Normalize a range starting
        # on that header exactly; do not guess a different header or period.
        excluded=[]
        if start==header:
            excluded.append(start);start+=1
        rows = list(range(start, end+1)); filters = item.get("filters", [])
        if not isinstance(filters, list) or len(filters) > 8:
            raise ValueError("过滤条件超出预算")
        for cond in filters:
            if set(cond) != {"column", "values"} or not isinstance(cond["values"], list) or not cond["values"]:
                raise ValueError("过滤需要列和非空values")
            col = source_column(workbook,{**item,"bounds":bounds},cond["column"])
            if not a <= col <= b:
                raise ValueError("过滤列不在业务范围")
            if apply_filters:
                rows = [r for r in rows if ws.cell(r, col).value in cond["values"]]
        if not rows:
            raise ValueError("声明范围或过滤没有业务记录")
        result[item["id"]] = {**item, "bounds": bounds, "selected_rows": rows,"excluded_header_rows":excluded,
                               "headers":{get_column_letter(c):str(ws.cell(header,c).value or '') for c in range(a,b+1)},
                               "input_records": end-start+1, "evaluated_records": len(rows)}
    return result


def calculate_spreadsheet_analysis(source, plan, deadline=None, domain="generic"):
    original = values = None
    requested_plan=plan
    error_path="plan"
    try:
        check = lambda: deadline_check(deadline)
        check(); source = Path(source).resolve()
        pack = domain_pack(domain)
        if set(plan)-{"tables", "calculations", "checks", "rules", "profile_tables"}:
            raise ValueError("分析计划包含未知字段")
        for key, limit in (("tables", 16), ("calculations", 64), ("checks", 32), ("rules", 32)):
            if not isinstance(plan.get(key, []), list) or len(plan.get(key, [])) > limit:
                raise ValueError("分析项超出预算")
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        original = openpyxl.load_workbook(source, data_only=False)
        prepare_tables(plan.get("tables", []), original, check, apply_filters=False)
        tasks = [item for key in ("calculations", "checks", "rules") for item in plan.get(key, [])]
        if not tasks and not (plan.get('profile_tables') is True and plan.get('tables')):
            raise ValueError("未制定分析计划，不能判定任务完成")
        ids = [item.get("id") for item in plan.get("tables", [])+tasks]
        if any(not isinstance(i,str) or not 1<=len(i)<=64 or not i.isprintable() or i.strip()!=i for i in ids) or len(set(ids)) != len(ids):
            raise ValueError("计划ID必须非空、唯一、可打印且不超过64字符")
        if any(not isinstance(t.get("label"), str) or not t["label"].strip() for t in tasks):
            raise ValueError("分析项需要明确名称")
        # Source targets have been validated before recalculation.
        has_formula = any(c.data_type == "f" for ws in original for row in ws for c in row)
        read_path, calculation = get_or_create_recalculated_workbook(source) if has_formula else (source, {"status":"literal_values"})
        if has_formula:
            provenance = calculation.get("provenance", {})
            if (calculation.get("status") not in ("verified", "recalculated_verified")
                    or provenance.get("workbook_id") != source_hash
                    or provenance.get("output_hash") != hashlib.sha256(Path(read_path).read_bytes()).hexdigest()):
                return ToolResult.error("calculation_unverified", "重算或来源验证未通过", data=calculation)
        check(); values = openpyxl.load_workbook(read_path, data_only=True)
        tables = prepare_tables(plan.get("tables", []), values, check)
        plan,normalizations=normalize_plan(plan,values,tables)
        units = [declared_amount_unit(original, ws.title, min(ws.max_row,20)) for ws in original]
        declared = {u for u, _ in units if u}
        amount_unit = next(iter(declared)) if len(declared)==1 else "undeclared_amount"
        evaluator = ExpressionEvaluator(values, tables, amount_unit, check)
        for table in tables.values():
            table["source_months"] = table_months(values, table)
        facts = []
        for item in plan.get("calculations", []):
            error_path=f"calculations.{item.get('id')}（{item.get('label')}）"
            if not {"id", "label", "expression"} <= set(item) or set(item)-{"id", "label", "expression", "output_unit", "metric_id"}:
                raise ValueError("非法计算计划")
            validate_caption(item, values, tables)
            validate_domain_calculation(item, semantic_bindings(item['expression'], values, tables), domain)
            before = evaluator.visited_cells
            evaluator.visited_cells = set()
            q = evaluator.evaluate(item["expression"])
            sources = sorted(evaluator.visited_cells)
            evaluator.visited_cells |= before
            if not sources:
                raise ValueError("计算必须引用真实来源，不能用常量伪造业务事实")
            if q.unit == "undeclared_amount":
                raise ValueError("金额单位未声明或有冲突，请读取并澄清来源单位")
            presented=present_quantity(q,item.get('output_unit','source'))
            validate_metric_result(item.get('metric_id'),presented['unit'],domain)
            facts.append({"id": item["id"], "label": item["label"], "source_cells":sources,
                          **({"metric_id":item["metric_id"]} if "metric_id" in item else {}),
                          **presented})
        checks = []
        for item in plan.get("checks", []):
            error_path=f"checks.{item.get('id')}（{item.get('label')}）"
            if not {"id", "label", "left", "right", "tolerance", "assumptions"} <= set(item) or set(item)-{"id", "label", "left", "right", "tolerance", "assumptions", "relation_type"} or not isinstance(item["assumptions"],str) or not item["assumptions"].strip():
                raise ValueError("等式检查必须包含明确假设与容差")
            validate_source_identity(item, original)
            before = evaluator.visited_cells
            evaluator.visited_cells = set()
            left, right = evaluator.evaluate(item["left"]), evaluator.evaluate(item["right"])
            sources = sorted(evaluator.visited_cells)
            evaluator.visited_cells |= before
            if not sources:
                raise ValueError("等式检查必须引用真实来源")
            if left.unit != right.unit or left.unit == "undeclared_amount":
                raise ValueError("等式两侧维度不同或单位未声明")
            tolerance = numeric(item["tolerance"])
            if tolerance < 0:
                raise ValueError("容差不能为负")
            checks.append({"id":item["id"],"label":item["label"],"left":str(left.value),"right":str(right.value),
                           "residual":str(left.value-right.value),"unit":left.unit,"tolerance":str(tolerance),
                           "passed":abs(left.value-right.value)<=tolerance,"assumptions":item["assumptions"],
                           "source_cells":sources})
        rules = [evaluate_rule(r, values, tables, check) for r in plan.get("rules", [])]
        profiles_result = profiles(values, tables, check) if rules or plan.get('profile_tables') is True else []
        if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
            return ToolResult.error("source_changed", "分析期间原件已变化")
        coverage = [{"id":t["id"],"sheet":t["sheet"],"data_range":t["data_range"],"header_row":t["header_row"],
                     "input_records":t["input_records"],"evaluated_records":t["evaluated_records"],
                     "excluded_header_rows":t["excluded_header_rows"],
                     "headers":t["headers"],"source_months":t.get("source_months"),
                     "selected_rows":t["selected_rows"],"filters":t.get("filters",[]),"coverage_complete":True} for t in tables.values()]
        canonical = json.dumps(plan, sort_keys=True, ensure_ascii=False,separators=(",",":"))
        plan_hash = hashlib.sha256(canonical.encode()).hexdigest()
        data = {"kind":"spreadsheet_analysis","plan":plan,"requested_plan":requested_plan,
                "semantic_domain":{"id":domain,"version":pack.VERSION if pack else "1"},
                "normalizations":normalizations,"plan_hash":plan_hash,"facts":facts,"checks":checks,
                "rules":rules,"profiles":profiles_result,"coverage":coverage,
                "visited_cells":sorted(evaluator.visited_cells),"amount_unit":amount_unit,
                "unit_sources":sorted({ref for _, refs in units for ref in refs})}
        data["evidence_id"] = hashlib.sha256((source_hash+json.dumps(data,sort_keys=True,ensure_ascii=False,default=str)).encode()).hexdigest()[:24]
        provenance = {"file_path":str(source),"workbook_id":source_hash,"calculation":calculation,"plan_hash":plan_hash}
        # Compact model view, full evidence remains available to the verifier.
        view = {k:data[k] for k in ("evidence_id","rules","profiles","amount_unit","semantic_domain")}
        if normalizations:view["protocol_normalizations"]=normalizations[:20]
        for key in ("facts", "checks"):
            view[key]=[{**{k:v for k,v in item.items() if k!="source_cells"},
                        "source_cell_count":len(item["source_cells"])} for item in data[key]]
        view["coverage"]=[{k:v for k,v in c.items() if k!="selected_rows"} for c in coverage]
        return ToolResult.success(data=data,provenance=provenance,text=json.dumps(view,ensure_ascii=False,default=str))
    except TimeoutError:
        raise
    except (ValueError, KeyError, TypeError, OSError, AttributeError, BadZipFile) as e:
        return ToolResult.error("invalid_analysis_plan", f"{error_path}：{e}", data={"requested_plan":requested_plan},
                                provenance={"file_path":str(source),"workbook_id":locals().get("source_hash"),"plan_hash":hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False,default=str).encode()).hexdigest()})
    finally:
        if original:original.close()
        if values:values.close()


def execute_spreadsheet_analysis(params, deadline=None):
    # Decode JSON-encoded structured fields at the protocol boundary only.
    # No inference or repair of business ranges/expressions happens here.
    params = dict(params)
    for key in ("tables", "calculations", "checks", "rules"):
        if isinstance(params.get(key),str):
            try:
                params[key] = json.loads(params[key])
            except ValueError:
                result = ToolResult.error("invalid_analysis_plan",f"{key}必须是JSON数组")
                return TextToolOutput(result.render_text(),result)
    source, error = resolve_sandboxed_path(params.get("file_path",""))
    if error or source is None:
        result = ToolResult.error("source_unavailable",error or "原件不可用")
    else:
        attachments=[v.strip() for v in os.getenv("DSH_SESSION_ATTACHMENTS", "").split(",") if v.strip()]
        from .config import WORKSPACE_DIR
        allowed={(Path(WORKSPACE_DIR)/name).resolve() for name in attachments}
        if allowed and source.resolve() not in allowed:
            result=ToolResult.error("source_outside_session_scope","当前原生分析仅接受本轮附件原件")
            return TextToolOutput(result.render_text(),result)
        result = calculate_spreadsheet_analysis(source,{k:v for k,v in params.items() if k!="file_path"},deadline,
                                              domain=runtime_domain())
    return TextToolOutput(result.render_text(),result)
