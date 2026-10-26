#!/usr/bin/env python3
"""Deterministic integration verification for the financial calculation pipeline.

This invokes Python tools directly. It does NOT test the browser, real model,
clarification, retry, or final delivery, and must not be reported as full E2E.
Real-model acceptance policy and cases live in
docs/artifacts/reviews/finance-harness-35b-20261025-interactive/cases.json.
At the product boundary, clarification and explicit failure/retry are valid
outcomes; only delivered claims require verified financial/data correctness.

Verifies the entire lifecycle against the real-world 'AI能力测试_财务报表.xlsx':
1. Headless LibreOffice Formula Recalculation & Cache Verification
2. Query Execution with `op: "value"` / `"first"`
3. Robust Deserialization of Serialized Query Strings with Trailing Commas
4. Arithmetic Derivation with Shorthand Operator `divide`
5. Full Metric Delivery & Gate Review Acceptance (`complete: True`)
"""

import os
import sys
import json
from decimal import Decimal
from pathlib import Path

# Setup import paths
if Path("/usr/local/bin/dsh_modules").exists():
    sys.path.insert(0, "/usr/local/bin")
else:
    REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent.parent
    SANDBOX_SRC = REPO_ROOT / "apps/backend/runtimes/personal-sandbox-runner/src"
    sys.path.insert(0, str(SANDBOX_SRC))

import openpyxl
from dsh_modules.workbook_calculation import get_or_create_recalculated_workbook
from dsh_modules.spreadsheet_analysis import execute_spreadsheet_analysis, calculate_spreadsheet_analysis
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.report_presentation import analysis_overview


def locate_test_file() -> Path:
    candidates = [
        Path("/workspace/AI能力测试_财务报表.xlsx"),
        Path("./data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/AI能力测试_财务报表.xlsx"),
        Path("/Users/chain/Documents/MyProject/ops-automation/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/AI能力测试_财务报表.xlsx"),
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(f"Cannot find AI能力测试_财务报表.xlsx in: {[str(c) for c in candidates]}")


def run_e2e_verification():
    file_path = locate_test_file()
    import dsh_modules.config as _cfg
    _cfg.WORKSPACE_DIR = str(file_path.parent.resolve())
    print("=" * 80)
    print(f"🚀 [Integration] 开始财务计算工具集成验证: {file_path.name}")
    print(f"    物理文件路径: {file_path.resolve()}")
    print("=" * 80)

    # -------------------------------------------------------------
    # 步骤 1: 无头重算与公式缓存验证
    # -------------------------------------------------------------
    print("\n[步骤 1/5] 验证表格无头公式重算与公式缓存有效性...")
    read_path, calc = get_or_create_recalculated_workbook(file_path)
    print(f"  -> 重算状态: {calc.get('status')}")
    print(f"  -> 统一缓存路径: {read_path}")
    assert calc.get("status") in ("recalculated_verified", "verified", "literal_values"), f"重算未通过: {calc}"

    wb_recalc = openpyxl.load_workbook(read_path, data_only=True)
    ws_profit = wb_recalc["利润表"]
    rev_val = ws_profit["B4"].value
    gp_val = ws_profit["B6"].value
    op_val = ws_profit["B10"].value
    np_val = ws_profit["B14"].value
    print(f"  -> 利润表重算值: 营业收入={rev_val}, 毛利={gp_val}, 营业利润={op_val}, 净利润={np_val}")
    assert rev_val is not None and float(rev_val) == 124020, f"营业收入预期 124020, 实际 {rev_val}"
    assert gp_val is not None and abs(float(gp_val) - 53443.25) < 0.01, f"毛利预期 53443.25, 实际 {gp_val}"
    print("  ✅ 步骤 1 验证通过：无头重算与公式缓存校验完全一致！")

    # -------------------------------------------------------------
    # 步骤 2: 验证 op: "value" 聚合算子
    # -------------------------------------------------------------
    print("\n[步骤 2/5] 验证 op: 'value' 聚合算子执行（此前报 不支持的聚合操作: 'value'）...")
    plan_value = {
        "file_path": str(file_path),
        "query": {
            "source": {"sheet": "利润表", "header_row": 3, "data_range": "A4:D14"},
            "where": {"field": "项目", "op": "in", "values": ["营业收入", "毛利", "营业利润", "净利润"]},
            "group_by": ["项目"],
            "metrics": [{"id": "actual", "label": "2026年实际", "op": "value", "field": "2026实际", "unit": "amount"}]
        }
    }
    os.environ["DSH_SESSION_ATTACHMENTS"] = file_path.name
    out_value = execute_spreadsheet_analysis(plan_value)
    res_value = out_value.tool_result
    assert res_value.is_success, f"op: value 执行失败: {res_value.error}"
    facts_map = {f["group_key"]: f["value"] for f in res_value.data["facts"]}
    print(f"  -> 提取到的事实键值: {facts_map}")
    assert facts_map.get("营业收入") == "124020", f"营业收入提取错误: {facts_map}"
    assert facts_map.get("毛利") == "53443.25", f"毛利提取错误: {facts_map}"
    assert facts_map.get("营业利润") == "21209.4", f"营业利润提取错误: {facts_map}"
    assert facts_map.get("净利润") == "16038.3", f"净利润提取错误: {facts_map}"
    print("  ✅ 步骤 2 验证通过：op: 'value' 成功读取各唯一行数值！")

    # -------------------------------------------------------------
    # 步骤 3: 验证序列化 JSON 字符串带尾部逗号反序列化自愈
    # -------------------------------------------------------------
    print("\n[步骤 3/5] 验证序列化 JSON 字符串带尾部逗号自愈（此前报 TypeError: dictionary update sequence...）...")
    plan_str_comma = {
        "file_path": str(file_path),
        "tables": [{"id": "profit_table", "sheet": "利润表", "header_row": 3, "data_range": "A4:D14", "filters": [{"column": "项目", "op": "in", "values": ["营业收入", "毛利"]}]}],
        "calculations": [
            {"id": "actual_amount", "label": "2026实际金额", "expression": {"aggregate": "sum", "column": "2026实际", "table": "profit_table"}, "output_unit": "千元"},
        ],
        "query": '{"source": {"data_range": "A4:D14", "header_row": 3, "sheet": "利润表"}, "where": {"and": [{"field": "项目", "op": "in", "values": ["营业收入", "毛利"]}]}, "group_by": ["项目"]},  \n'
    }
    out_comma = execute_spreadsheet_analysis(plan_str_comma)
    res_comma = out_comma.tool_result
    assert res_comma.is_success, f"带逗号的 query 字符串反序列化失败: {res_comma.error}"
    comma_facts = {f["group_key"]: f["value"] for f in res_comma.data["facts"]}
    assert comma_facts.get("营业收入") == "124020" and comma_facts.get("毛利") == "53443.25", f"分组金额错误: {comma_facts}"
    print(f"  -> 成功提取事实数: {len(res_comma.data['facts'])} ({comma_facts})")
    print("  ✅ 步骤 3 验证通过：带尾部逗号的 JSON 字符串安全自愈执行且分组数值精确！")

    # -------------------------------------------------------------
    # 步骤 4: 验证算术简写操作符 divide 规范化与计算
    # -------------------------------------------------------------
    print("\n[步骤 4/5] 验证受限表达式简写结构 {'divide': [...]} 自动规范化与计算...")
    plan_divide = {
        "file_path": str(file_path),
        "tables": [
            {"id": "t_rev", "sheet": "利润表", "header_row": 3, "data_range": "A4:D14", "filters": [{"column": "项目", "values": ["营业收入"]}]},
            {"id": "t_gp", "sheet": "利润表", "header_row": 3, "data_range": "A4:D14", "filters": [{"column": "项目", "values": ["毛利"]}]},
        ],
        "calculations": [
            {"id": "rev", "label": "营业收入", "expression": {"aggregate": "sum", "table": "t_rev", "column": "B", "unit": "amount"}, "output_unit": "千元"},
            {"id": "gp", "label": "毛利", "expression": {"aggregate": "sum", "table": "t_gp", "column": "B", "unit": "amount"}, "output_unit": "千元"},
            {"id": "gm", "label": "毛利率", "expression": {"divide": [{"ref": "gp"}, {"ref": "rev"}]}, "output_unit": "%"}
        ]
    }
    out_divide = execute_spreadsheet_analysis(plan_divide)
    res_divide = out_divide.tool_result
    assert res_divide.is_success, f"divide 简写计算失败: {res_divide.error}"
    gm_fact = next((f for f in res_divide.data["facts"] if f["id"] == "gm"), None)
    assert gm_fact is not None, f"未找到毛利率计算项: {res_divide.data['facts']}"
    gm_val = float(gm_fact["value"])
    print(f"  -> 毛利率计算结果: {gm_val} % (单位: {gm_fact['unit']})")
    assert abs(gm_val - 43.0924) < 0.01, f"毛利率计算错误: {gm_val}"
    print("  ✅ 步骤 4 验证通过：{'divide': [...]} 自动展开编译并正确计算！")

    # -------------------------------------------------------------
    # 步骤 5: 验证月度经营全指标提取与任务门禁审核
    # -------------------------------------------------------------
    print("\n[步骤 5/5] 验证月度经营汇总行一键全指标提取与门禁核验...")
    plan_full = {
        "file_path": str(file_path),
        "query": {
            "source": {"sheet": "月度经营", "header_row": 3, "data_range": "A16:N16"},
            "metrics": [
                {"id": "rev", "label": "2026年营业收入", "field": "营业收入", "op": "value", "unit": "amount"},
                {"id": "gross_margin", "label": "2026年毛利率", "field": "毛利率", "op": "value", "unit": "%"},
                {"id": "op_profit", "label": "2026年营业利润", "field": "营业利润", "op": "value", "unit": "amount"},
                {"id": "net_profit", "label": "2026年净利润", "field": "净利润", "op": "value", "unit": "amount"}
            ]
        }
    }
    out_full = execute_spreadsheet_analysis(plan_full)
    res_full = out_full.tool_result
    assert res_full.is_success, f"月度经营全指标提取失败: {res_full.error}"

    prompt = "总结2026年收入、毛利率、营业利润和净利润。"
    state = analysis_task_state([res_full], prompt)
    print(f"  -> 门禁任务完成状态 (complete): {state['complete']}")
    print(f"  -> 遗留问题项 (issues): {state['issues']}")
    print(f"  -> 缺失指标项 (missing_metrics): {state['missing_metrics']}")
    assert state["complete"] is True, f"任务状态应为 True，实际为: {state}"
    assert len(state["issues"]) == 0, f"存在未解决问题: {state['issues']}"
    assert len(state["missing_metrics"]) == 0, f"存在缺失指标: {state['missing_metrics']}"

    overview_text = analysis_overview([res_full], prompt)
    print("\n  -> 自动生成交付汇总表:")
    print(overview_text)
    print("  ✅ 步骤 5 验证通过：门禁核验 100% 通过（complete=True），零缺失指标！")

    print("\n" + "=" * 80)
    print("🎉 [Integration] 财务计算工具集成验证通过：5/5。此结果不代表真实模型端到端验收通过。")
    print("=" * 80)


if __name__ == "__main__":
    run_e2e_verification()
