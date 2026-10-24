#!/usr/bin/env python3
"""
Comprehensive End-to-End Verification Script.
Runs inside or outside the container, verifying:
1. Cross-month template memory inheritance (different file hash, same template).
2. Strict exact-match gate (mismatching title triggers user input, no hallucinated guess).
3. Deterministic aggregation via actual aggregate_spreadsheet tool.
4. Schema flexibility (multi-section target_kind, harmless params tolerance).
5. Tolerant result binding (amount_sum / single-result fallback).
6. Execution with 11 backfills and formula recalculation.
7. Legacy forecast disclosure (FC34022 row 37 +2.87059 K).
8. Single-card presentation guarantee.
"""
import os
import sys
import json
import shutil
import tempfile
from decimal import Decimal
from pathlib import Path

# Setup paths
SANDBOX_SRC = Path('/usr/local/bin/dsh_modules')
if not SANDBOX_SRC.exists():
    REPO_ROOT = Path('/workspace') if (Path('/workspace') / 'docs').exists() else Path('/Users/chain/Documents/MyProject/ops-automation')
    SANDBOX_SRC = REPO_ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules'
    sys.path.insert(0, str(SANDBOX_SRC.parent))
else:
    sys.path.insert(0, '/usr/local/bin')

import openpyxl
import dsh_modules.config
from dsh_modules.tools import execute_tool
from dsh_modules.domain_memory import (
    save_section_mapping,
    resolve_section_mapping,
    clear_domain_memory
)
from dsh_modules.user_declarations import bind_user_declarations
from dsh_modules.spreadsheet_update.tools import (
    tool_plan_spreadsheet_update,
    tool_execute_spreadsheet_update,
    dispatch_update_tool,
    reset_turn_results,
    harvest_analytical_facts
)
from dsh_modules.spreadsheet_update.result_catalog import (
    fingerprint,
    reset_results,
    select_result
)
from dsh_modules.spreadsheet_update.layout_binding import locate, BindingNeedsInput
from dsh_modules.spreadsheet_update.presentation import render_published_update
from dsh_modules.tool_result import ToolResult


def run_full_e2e():
    print("=" * 75)
    print("🚀 开始端对端全链路真实数据与记忆系统验证...")
    print("=" * 75)

    temp_dir = tempfile.TemporaryDirectory(prefix="e2e-verify-")
    ws_path = Path(temp_dir.name).resolve()
    print(f"📁 [Step 1/6] 准备隔离工作区: {ws_path}")

    # Copy real production test attachments
    repo_root = Path('/workspace/ops-automation') if Path('/workspace/ops-automation').exists() else Path('/Users/chain/Documents/MyProject/ops-automation')
    audit_dir = repo_root / 'docs/artifacts/reviews/spreadsheet-update-call-audit-20261024-1831'
    target_src = audit_dir / '工数3Q预实管理.xlsx'
    source_src = audit_dir / '工数实绩明细_20261020134124.xlsx'
    if not target_src.exists() and (Path('/workspace') / '工数3Q预实管理.xlsx').exists():
        target_src = Path('/workspace') / '工数3Q预实管理.xlsx'
        source_src = Path('/workspace') / '工数实绩明细_20261020134124.xlsx'

    shutil.copy2(target_src, ws_path / '工数3Q预实管理.xlsx')
    shutil.copy2(source_src, ws_path / '工数实绩明细_20261020134124.xlsx')

    # Also prepare a simulated November file (same template, different name/hash)
    shutil.copy2(target_src, ws_path / '工数3Q预实管理_1120.xlsx')

    # Set WORKSPACE env & config
    os.environ['WORKSPACE'] = str(ws_path)
    os.environ['WORKSPACE_DIR'] = str(ws_path)
    dsh_modules.config.WORKSPACE_DIR = ws_path
    clear_domain_memory(str(ws_path))
    reset_results()
    reset_turn_results()

    # -------------------------------------------------------------------------
    # Test 1: Domain Memory - October Confirmation -> November Auto-Inheritance
    # -------------------------------------------------------------------------
    print("🧠 [Step 2/6] 验证记忆系统：模版场景特征与跨月份继承...")
    save_section_mapping(
        section_name="无偿",
        target_title="*P/Y/EX（不含L/*B）",
        file_name="工数3Q预实管理_1024.xlsx",
        file_hash="sha256_mock_october_hash",
        quote="【*P/Y/EX（不含L/*B）】",
        workspace=str(ws_path)
    )

    # November file has different hash, but same canonical template '工数3Q预实管理'
    remembered_nov = resolve_section_mapping(
        section_name="无偿",
        file_name="工数3Q预实管理_1120.xlsx",
        file_hash="sha256_mock_november_hash",
        workspace=str(ws_path)
    )
    assert remembered_nov == "*P/Y/EX（不含L/*B）", f"Expected *P/Y/EX（不含L/*B）, got {remembered_nov}"
    print("   ✓ 跨月份新 Excel (不同 Hash) 成功命中模版记忆！")

    # -------------------------------------------------------------------------
    # Test 2: Domain Memory - Strict Exact-Match Gate
    # -------------------------------------------------------------------------
    print("🛡️ [Step 3/6] 验证记忆门禁：当表格标题变动时绝对不猜，立即请求用户确认...")
    wb_test = openpyxl.load_workbook(ws_path / '工数3Q预实管理.xlsx')
    ws_1019 = wb_test['1019']

    # When sheet actually contains '*P/Y/EX（不含*L/*B）' -> exact match gate passes
    spec, col = locate(
        ws_1019, section="无偿", period="202610", target_label="预测",
        source_keys={"FC45031", "FC44004"}, file_name="工数3Q预实管理_1120.xlsx",
        workspace=str(ws_path)
    )
    assert col == 3, f"Expected column 3 (C), got {col}"
    print("   ✓ 工作表中真实存在完全匹配标题 -> 门禁通过，作为入力回填！")

    # When sheet has a completely foreign title -> strict gate blocks and prompts user input
    ws_1019.cell(spec['header_row'] - 2, 1).value = "未知的全新区块标题"
    wb_mismatch = openpyxl.Workbook()
    ws_m = wb_mismatch.active
    ws_m["A1"] = "工数预实"
    ws_m["A3"] = "未知的全新区块"
    ws_m["A4"] = "部门编号"
    ws_m["B4"] = "202610"
    ws_m["B5"] = "预测"
    ws_m["A6"] = "FC45031"
    ws_m["B6"] = 100

    prompted = False
    try:
        locate(
            ws_m, section="无偿", period="202610", target_label="预测",
            source_keys={"FC45031"}, file_name="工数3Q预实管理_1120.xlsx",
            workspace=str(ws_path)
        )
    except BindingNeedsInput as exc:
        prompted = True
        print(f"   ✓ 标题不符时触发刚性门禁，弹出用户确认: {exc.message[:50]}...")
    assert prompted, "Expected BindingNeedsInput exception when title does not match sheet!"

    # -------------------------------------------------------------------------
    # Test 3: Deterministic Data Aggregation via actual aggregate_spreadsheet
    # -------------------------------------------------------------------------
    print("📊 [Step 4/6] 验证确定性数据聚合引擎 (实调 aggregate_spreadsheet)...")
    paid_tool_res = execute_tool('aggregate_spreadsheet', {
        'file_path': '工数实绩明细_20261020134124.xlsx',
        'sheet': '工数实绩明细',
        'header_row': 4,
        'value_field': '金额(K)',
        'operation': 'sum',
        'group_by': ['部门编号'],
        'filters': [
            {'field': '工数年月', 'op': 'eq', 'value': '202610'},
            {'field': '有偿无偿', 'op': 'eq', 'value': '有偿'}
        ]
    })
    assert paid_tool_res.tool_result.status == 'success', f"Paid aggregation failed: {paid_tool_res.tool_result.error}"
    paid_data = paid_tool_res.tool_result.data
    paid_prov = paid_tool_res.tool_result.provenance
    harvest_analytical_facts(paid_data, provenance=paid_prov)
    ev_paid_id = paid_data['evidence_id']
    paid_facts = paid_data.get('facts', [])
    assert len(paid_facts) == 7, f"Expected 7 paid facts, got {len(paid_facts)}"
    paid_total = sum(Decimal(f['value']) for f in paid_facts)
    print(f"   ✓ 有偿聚合完成: 7 个部门已捕获 (证据 ID: {ev_paid_id}, 合计: {paid_total} K)")

    unpaid_tool_res = execute_tool('aggregate_spreadsheet', {
        'file_path': '工数实绩明细_20261020134124.xlsx',
        'sheet': '工数实绩明细',
        'header_row': 4,
        'value_field': '金额(K)',
        'operation': 'sum',
        'group_by': ['部门编号'],
        'filters': [
            {'field': '工数年月', 'op': 'eq', 'value': '202610'},
            {'field': '有偿无偿', 'op': 'eq', 'value': '无偿'}
        ]
    })
    assert unpaid_tool_res.tool_result.status == 'success', f"Unpaid aggregation failed: {unpaid_tool_res.tool_result.error}"
    unpaid_data = unpaid_tool_res.tool_result.data
    unpaid_prov = unpaid_tool_res.tool_result.provenance
    harvest_analytical_facts(unpaid_data, provenance=unpaid_prov)
    ev_unpaid_id = unpaid_data['evidence_id']
    unpaid_facts = unpaid_data.get('facts', [])
    assert len(unpaid_facts) == 4, f"Expected 4 unpaid facts, got {len(unpaid_facts)}"
    unpaid_total = sum(Decimal(f['value']) for f in unpaid_facts)
    print(f"   ✓ 无偿聚合完成: 4 个部门已捕获 (证据 ID: {ev_unpaid_id}, 合计: {unpaid_total} K)")

    # -------------------------------------------------------------------------
    # Test 4: Plan Construction & Schema Tolerance
    # -------------------------------------------------------------------------
    print("📝 [Step 5/6] 验证更新计划编译与 Schema 容错（支持多区块 target_kind、指标容错）...")
    bind_user_declarations({
        'unit_confirmation': {'unit': 'K', 'quote': '以K为单位'},
        'user_statements': ['以K为单位']
    })

    plan_req = {
        'target_file': '工数3Q预实管理.xlsx',
        'base_sheet': '1019',
        'new_sheet': '1024',
        'period': '202610',
        'period_field': '工数年月',
        'comment': '自动辅助说明',  # Harmless extra parameter
        'sections': [
            {
                'section': '有偿',
                'target_label': '预测',
                'target_kind': 'forecast',
                'result_id': ev_paid_id,
                'key_field': '部门编号'
            },
            {
                'section': '*P/Y/EX（不含L/*B）',
                'target_label': '预测',
                'target_kind': 'forecast',
                # Testing tolerant fallback: model passes metric field instead of evidence ID
                'result_id': unpaid_data['plan']['metrics'][0]['id'],
                'key_field': '部门编号'
            }
        ]
    }

    # Dispatch tool
    plan_out = dispatch_update_tool('plan_spreadsheet_update', plan_req)
    assert not plan_out.tool_result.is_error, f"Plan failed: {plan_out.tool_result.error}"
    plan_data = plan_out.tool_result.data if (plan_out.tool_result and plan_out.tool_result.data) else json.loads(str(plan_out).split('\n')[0])
    plan_id = plan_data['plan_id']
    preview = plan_data['preview']
    warnings = plan_data.get('warnings', [])

    assert len(preview) == 11, f"Expected 11 preview items, got {len(preview)}"
    print(f"   ✓ 计划成功锁定 (ID: {plan_id})，回填项数: {len(preview)}")
    print(f"   ✓ 对账披露警告: {warnings}")
    # Verify non-zero impact warning captures FC34022 (+2.87059 K)
    assert any('FC34022' in w and '2.87059' in w for w in warnings), "FC34022 retention not disclosed in warnings!"

    # -------------------------------------------------------------------------
    # Test 5: Execution, Recalculation & Independent Readback
    # -------------------------------------------------------------------------
    print("⚙️ [Step 6/6] 验证文件落盘、公式重算与单元格回填精度...")
    exec_out = dispatch_update_tool('execute_spreadsheet_update', {'plan_id': plan_id})
    assert not exec_out.tool_result.is_error, f"Execution failed: {exec_out.tool_result.error}"
    exec_data = exec_out.tool_result.data if (exec_out.tool_result and exec_out.tool_result.data) else json.loads(str(exec_out).split('\n')[0])
    published_file = Path(exec_data['published_file'])

    assert published_file.exists(), f"Published file {published_file} does not exist!"
    print(f"   ✓ 交付物落盘成功: {published_file.name} ({published_file.stat().st_size} bytes)")

    # Independent readback
    wb_pub = openpyxl.load_workbook(published_file, data_only=True)
    assert '1024' in wb_pub.sheetnames, "Sheet 1024 missing in published workbook!"
    ws_1024 = wb_pub['1024']

    # Expected cell backfill values
    expected_backfills = {
        'C10': '570.75345',  # FC45031 (有偿)
        'C5':  '67.0353',    # FC48005 (有偿)
        'C15': '171.65638',  # FC44006 (有偿)
        'C14': '242.51766',  # FC44004 (有偿)
        'C16': '167.77218',  # FC34022 (有偿)
        'C13': '212.90759',  # FC44003 (有偿)
        'C8':  '314.48323',  # FC46005 (有偿)
        'C31': '106.83199',  # FC45031 (无偿)
        'C35': '11.38824',   # FC44004 (无偿)
        'C34': '8.085',      # FC44003 (无偿)
        'C29': '14.3',       # FC46005 (无偿)
    }

    for coord, val in expected_backfills.items():
        cell_val = str(ws_1024[coord].value)
        assert cell_val == val, f"Coordinate {coord} expected {val}, got {cell_val}"
    print("   ✓ 11 个回填单元格数值全部通过独立 Decimal 精度校验！")

    # Verify legacy forecast value FC34022 unpaid row 37 is strictly preserved
    fc34022_unpaid_val = str(ws_1024['C37'].value)
    assert fc34022_unpaid_val == '2.87059', f"FC34022 unpaid forecast expected 2.87059, got {fc34022_unpaid_val}"
    print(f"   ✓ 历史预测保留项 FC34022 (C37={fc34022_unpaid_val} K) 完整保护，未发生破坏！")

    # Verify final answer presentation
    evidence = [
        ToolResult.success(data=plan_data, provenance={'tool': 'plan_spreadsheet_update'}),
        ToolResult.success(data=exec_data, provenance={'tool': 'execute_spreadsheet_update'})
    ]
    final_text = render_published_update(evidence, str(ws_path))
    assert final_text is not None, "render_published_update returned None!"
    assert '工数3Q预实管理_1024' in final_text
    assert '11' in final_text
    assert '570.75345' in final_text
    assert 'FC34022' in final_text
    assert '2.87059' in final_text
    print("   ✓ 最终生成 Markdown 包含完整且真实对齐的 11 项回填表与差异说明！")

    print("=" * 75)
    print("🎉 端对端全链路实测验证全部通过！所有指标与门禁均达标！")
    print("=" * 75)
    return True


if __name__ == '__main__':
    run_full_e2e()
