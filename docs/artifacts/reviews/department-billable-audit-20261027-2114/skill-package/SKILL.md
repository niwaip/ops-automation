---
name: dept-summary
zh_name: "部门别有偿统计"
description: "基于工数实绩明细表，按部门编号分组汇总金额（K），并排除WBS编号以特定前缀开头的记录。"
zh_description: "基于工数实绩明细表，按部门编号分组汇总金额（K），并排除WBS编号以特定前缀开头的记录。"
triggers:
  - "部门别有偿统计"
  - "用部门别有偿统计处理"
  - "dept-summary"
aliases: ["部门别有偿统计", "dept-summary"]
deliverables: []
requires_execution: true
execution_mode: verified_workflow
default_rounds: 1
---

# 部门别有偿统计

用户需要处理包含'部门编号'、'金额'和'WBS编号'字段的表格数据，要求按部门统计金额总和，且需过滤掉WBS编号以指定前缀（如ex, sy等）开头的无效或特殊数据。适用于XLSX/XLSM格式的单一工作表数据清洗与聚合。

- 加载指定Excel文件，定位到包含'部门编号'、'金额(K)'和'WBS编号'的工作表。
- 数据预处理：筛选保留'WBS编号'列中不包含前缀'ex', 'sy', 'sp', 'ip', 'ib', 'sz'的行数据。
- 数据分组：以'部门编号'为唯一分组键，对原始数据进行分组。
- 聚合计算：对每个分组内的'金额(K)'字段执行求和操作，得到各部门金额合计。
- 输出结果：生成包含'部门编号'和'合计金额'的新表格/数据集。

执行当前附件时按字段重新定位数据，不固化旧文件名、行号或旧结果。核算由确定性程序执行并验收；有歧义时先确认，不能从技能名称补充筛选。

- 核算规则与操作：[workflow.json](references/workflow.json)。执行时读取。
- 用户原话与提炼依据：[authoring.json](references/authoring.json)。追溯或修改口径时读取。
- 独立重放验收：[validation.json](references/validation.json)。排查数值差异时读取。
- 独立执行：`python scripts/run.py --input /workspace/新附件.xlsx --receipt /workspace/核算回执.json`。

结果表格由程序生成。LLM 仅基于验证回执选择解读重点，不改写数值或推断未确认的业务原因。
