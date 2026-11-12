## 规范三：表格生成、公式兼容性防火墙与重算校验（Generation Mode）

### 1. 运行环境与动态公式约束
- **预装库**：沙箱已内置 `openpyxl`，直接 `import openpyxl` 即可，**严禁使用 `pip install`**。
- **动态公式**：新建或编辑保存工作簿时，计算总计、均值、比率**必须写入 Excel 动态公式**（如 `=SUM(B2:B10)`、`=AVERAGE(C2:C10)`），确保输入变化可重算。
- **输出位置**：生成的新文件保存至 `/workspace/<filename>.xlsx`。
- **公式重算强校验（Recalculate Mandatory）**：新建/修改保存的 openpyxl 工作簿默认无公式缓存值。保存后必须执行 `/opt/dsh/skills/xlsx/scripts/recalc.py` 完成无头计算与格式修复。

### 2. 函数兼容性防火墙（Choosing Formulas That Survive Verification）
1. **首选经典稳固函数（无需前缀）**：
   - `SUMIFS`, `COUNTIF`, `INDEX`, `MATCH`, `IFERROR`, `SUMPRODUCT`, `VLOOKUP`, `AVERAGE`
2. **现代函数必须添加 `_xlfn.` 前缀**：
   - `_xlfn.TEXTJOIN(...)`, `_xlfn.CONCAT(...)`, `_xlfn.IFS(...)`, `_xlfn.SWITCH(...)`, `_xlfn.MAXIFS(...)`, `_xlfn.MINIFS(...)`
3. **严禁使用动态数组溢出函数**：
   - 严禁使用 `XLOOKUP`, `XMATCH`, `SORT`, `FILTER`, `UNIQUE`, `SEQUENCE`（因缺乏 spill metadata 会造成数据被截断）。请在 Python 侧预先完成排序与去重，或使用 `INDEX` + `MATCH` 替代。

### 3. 标准生成与重算校验命令
```bash
# 步骤 1: 运行 Python openpyxl 脚本生成 xlsx 文件
python3 generate_sheet.py

# 步骤 2: 驱动无头 LibreOffice 重算公式并固化缓存值 (强制执行)
python3 /opt/dsh/skills/xlsx/scripts/recalc.py /workspace/业务度量统计报表.xlsx
```

运行 `recalc.py` 会返回 JSON 诊断及四态校验状态：
- `verified`: 所有公式均有有效计算缓存且 0 错误（通过验收，退出码 0）；
- `partial`: 重算运行但部分公式未计算或含错误值（未通过，需检查报错单元格并修复）；
- `failed`: 全部公式未计算或进程失败（未通过）；
- `unavailable`: 缺少 soffice 环境依赖。
仅当返回 `status == "verified"` 且 `total_errors == 0` 时，方可判定公式计算生效。

### 4. 表格生成最佳实践
⚠️ 若当前任务为查阅、分析、审计、核算已有 Excel 文件，**严禁执行代码创建或覆盖原工作簿**。新建/生成表格时的规范要点：
1. **数据与标题**：明确表头与单元格数据，冻结首行或首列便于阅读；
2. **格式化**：按列设置 `number_format`（如货币 `#,##0.00`、百分比 `0.00%`、整数 `#,##0`）；
3. **动态公式**：求和、均值等汇总项必须使用动态公式（`=SUM(...)`、`=AVERAGE(...)`），严禁硬编码计算结果；
4. **重算校验**：生成后必须执行 `python3 /opt/dsh/skills/xlsx/scripts/recalc.py <output_file>` 固化缓存并校验 `verified` 状态。
