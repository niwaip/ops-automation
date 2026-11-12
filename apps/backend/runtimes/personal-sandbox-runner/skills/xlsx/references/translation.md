## 规范五：既有表格原地编辑与多语言翻译保真规范 (In-Place Mutation & Translation)

⚠️ **【重大红线：严禁新建空工作簿逐格搬运】**：
在对既有 Excel 进行**翻译、单元格回填、文字更新或修改**时，**严禁使用 `openpyxl.Workbook()` 从头新建空白工作簿并手动拷贝单元格！**
从头新建会导致原工作簿的以下底层 OOXML 结构 100% 丢失：
1. **数据验证下拉框 (`ws.data_validations`)**：所有下拉选择列表、输入提示与验证规则全部丢失！
2. **条件格式 (`ws.conditional_formatting`)**：所有预设的动态高亮、底色标记全部丢失！
3. **视图属性 (`ws.freeze_panes`, `ws.views`)**：首行/首列冻结与多窗口分割全部丢失！
4. **图表、矢量形状与图片** 全部丢失！

### 推荐方案：受控的整本翻译与原生结构验收
明确目标语言的整本 XLSX 翻译由运行时直接执行，跳过自由文本规划与重复工具选择。引擎按文本条数和字符预算分批，完整性失败会保留已完成检查点并停止发布。覆盖共享/内联字符串、富文本各段、工作表名、下拉选项、可编辑图形、批注和公式文本常量；图片内文字保持原样。

译文与检查点只允许在同一会话内复用；不同会话即使上传完全相同文件，也重新翻译，不能引用其他会话的旧译文或成品代替本轮执行。会话标识由运行时通过 `DSH_SESSION_ID` 传入；无会话标识时不读取旧检查点。图片保持原样，不做 OCR 或图片文字翻译。

这一路径保留原生 OOXML 部件、结构化样式绑定及原有缓存，并在目标为非日文时对日文专属字体/字符集执行受控本地化映射，同时保护受公式/条件格式引用的编码前缀并同步跨表引用，默认不通过 LibreOffice 重写交付工作簿，设置 Excel 打开时重算。新建/保存后 `recalc.py` 重算规则不适用于原生包内文本翻译。结构与译文门禁不等于逐页视觉验收或全文语义审校，不能预设“100%保真”或宣称原生公式已经验证生效。

- **翻译为中文 Excel 表格 (Simplified Chinese)**：
  ```bash
  python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto \
    "/workspace/<输入文件>.xlsx" \
    "/workspace/<输出文件>.xlsx" \
    --target-lang zh-CN
  ```

- **翻译为英文 Excel 表格 (English)**：
  ```bash
  python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto \
    "/workspace/<输入文件>.xlsx" \
    "/workspace/<输出文件>.xlsx" \
    --target-lang en-US
  ```

- **翻译为日文 Excel 表格 (Japanese)**：
  ```bash
  python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto \
    "/workspace/<输入文件>.xlsx" \
    "/workspace/<输出文件>.xlsx" \
    --target-lang ja-JP
  ```

### 备用方案：分步流水线法
如需中间干预或查看译文数据：
1. **第 1 步：解包提取待翻译 JSON 字典**
   ```bash
   python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py unpack "/workspace/<输入文件>.xlsx" --out-json /workspace/translation_input.json --temp-dir /workspace/.ooxml_temp
   ```
2. **第 2 步：并发批量翻译**
   ```bash
   python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py translate /workspace/translation_input.json /workspace/translation_output.json --target-lang zh-CN
   ```
3. **第 3 步：注入并重新打包**
   ```bash
   python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py pack /workspace/.ooxml_temp /workspace/translation_output.json "/workspace/<输出文件>.xlsx" --target-lang zh-CN
   ```

### 备用方案二：openpyxl 原地改写模式 (仅用于局部单元格数值/公式更新)
若属于小规模定制逻辑（非全量翻译），必须遵循**原地加载并另存**流程：`openpyxl.load_workbook(src_path, data_only=False)` 原地改写目标单元格/数据验证后 `wb.save(output_path)`，再运行 `recalc.py`。

### 面向用户的友好交付汇报规范
- **严禁**：输出术语对照表、全表倾泻、暴露 `--target-lang`/`unpack/pack`/`sharedStrings`/`ooxml`/`/workspace/` 等内部名词或路径。
- **简洁汇报**：说明完成状态、实际文件名和已执行的核验；不能声称未经验证的“100%保真”“公式已生效”或“全文翻译准确”。失败时说明原因与可操作下一步建议。
