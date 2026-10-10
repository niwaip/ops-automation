"""Metadata and small coordinate-preserving samples, without eager recalculation."""

import json
import re
import hashlib
import time
from pathlib import Path
from .workbook_reader import inspect_workbook, WorkbookManifest
from .worksheet_metadata import worksheet_dimensions
from .tool_result import ToolResult, TextToolOutput
from .file_tools import resolve_sandboxed_path
import openpyxl
from openpyxl.utils import get_column_letter


STRUCTURE_TOOL_NAME = 'inspect_spreadsheet_structure'
STRUCTURE_TOOL = {'type':'function','function':{
    'name':STRUCTURE_TOOL_NAME,
    'description':'按需读取指定工作表结构和带坐标样本，不重算、不证明完整业务数据。名称必须来自工作簿目录。',
    'parameters':{'type':'object','additionalProperties':False,'properties':{
        'file_path':{'type':'string'}, 'sheets':{'type':'array','minItems':1,'maxItems':4,
            'items':{'type':'string'}}},'required':['file_path','sheets']}}}


def spreadsheet_structure(source, selected_sheets=None, deadline=None):
    manifest=inspect_workbook(source)
    if not isinstance(manifest,WorkbookManifest):
        return manifest
    if selected_sheets is not None and (not isinstance(selected_sheets,list) or not 1<=len(selected_sheets)<=4
        or any(not isinstance(s,str) or s not in manifest.sheet_names for s in selected_sheets)):
        return ToolResult.error('invalid_sheet_selection','请选择目录中真实存在的1至4张工作表',
                                data={'available_sheets':manifest.sheet_names})
    workbook=openpyxl.load_workbook(source,read_only=True,data_only=False)
    try:
        sheets=[]
        for ws in workbook:
            if selected_sheets is not None and ws.title not in selected_sheets:
                continue
            if deadline is not None and time.monotonic()>=deadline:
                raise TimeoutError('Spreadsheet structure deadline exceeded')
            dimensions=worksheet_dimensions(ws)
            sample=[];headers=[];row_labels=[];footers=[];observed={}
            limit=32 if ws.max_row<=32 else 20
            # Read a bounded prefix plus footer, never claim a full nonempty count.
            for row in ws.iter_rows(max_row=min(limit,ws.max_row),max_col=min(ws.max_column,64)):
                filled=[c for c in row if c.value is not None]
                if filled:observed[filled[0].row]=filled
            if ws.max_row>limit:
                for row in ws.iter_rows(min_row=max(limit+1,ws.max_row-1),max_col=min(ws.max_column,64)):
                    filled=[c for c in row if c.value is not None]
                    if filled:observed[filled[0].row]=filled
            for row_index,filled in sorted(observed.items()):
                strings=[c for c in filled if isinstance(c.value,str) and not c.value.startswith("=")]
                if row_index<=20 and len(strings)>=2 and len(strings)==len(filled):
                    headers.append({"row":row_index,"columns":{get_column_letter(c.column):str(c.value) for c in strings}})
                first=next((c for c in filled if c.column==1),None)
                if (first and not (isinstance(first.value,str) and first.value.startswith("="))
                        and (ws.max_row<=32 or len(row_labels)<3 or row_index>=ws.max_row-1)):
                    row_labels.append({"cell":first.coordinate,"value":str(first.value)})
                    if row_index>=ws.max_row-1 and re.search(r"合计|总计|grand total|^total$",str(first.value),re.I):
                        footers.append(row_index)
            best=max(headers,key=lambda h:len(h["columns"]),default=None)
            sample_indices=(sorted(observed)[:5]+sorted(observed)[-2:] if selected_sheets is not None
                            else ([best['row']+1] if best else sorted(observed)[:1]))
            for index in dict.fromkeys(sample_indices):
                if index in observed:
                    sample.append({c.coordinate:str(c.value)[:150] for c in observed[index][:20]})
            end=ws.max_row
            while end in footers:end-=1
            candidates=([{"header_row":best["row"],"data_range":f"A{best['row']+1}:{get_column_letter(ws.max_column)}{end}",
                           "reason":"候选来自非公式文本表头；排除末尾显式合计行，请按任务核对"}]
                         if best and best["row"]<end else [])
            sheets.append({"sheet":ws.title,"dimensions":dimensions,"physical_rows":ws.max_row,
                           "coverage_complete":False,"sample_cells":sample,
                           "header_candidates":sorted(headers,key=lambda h:len(h["columns"]),reverse=True)[:3],
                           "data_region_candidates":candidates,"row_labels":row_labels})
        if hashlib.sha256(Path(source).read_bytes()).hexdigest()!=manifest.file_hash:
            return ToolResult.error('source_changed','结构读取期间原件发生变化')
        payload={"kind":"spreadsheet_structure","workbook_id":manifest.file_hash,"extraction_mode":"SCHEMA_SAMPLE",
                 "available_sheets":manifest.sheet_names,
                 "coverage_complete":False,"sheets":sheets}
        return ToolResult.success(data=payload, text=json.dumps(payload,ensure_ascii=False),
                                  provenance={'file_path':str(Path(source).resolve()),'workbook_id':manifest.file_hash})
    finally:
        workbook.close()


def build_spreadsheet_source_context(source, deadline=None):
    result=spreadsheet_structure(source,deadline=deadline)
    if not result.is_success:return result.render_text()
    return '[Workbook Source Structure]:\n'+result.render_text()+(
        '\n这是结构与样本，不是完整业务数据或计算结果。已有明确候选时直接执行分析计划；'
        '需要更多结构时用inspect_spreadsheet_structure指定真实Sheet按需读取。')


def execute_spreadsheet_structure(params,deadline=None):
    source,error=resolve_sandboxed_path(params.get('file_path',''))
    if error or source is None:
        result=ToolResult.error('source_unavailable',error or '原件不可用')
    else:
        import os
        from .config import WORKSPACE_DIR
        attachments=[v.strip() for v in os.getenv('DSH_SESSION_ATTACHMENTS','').split(',') if v.strip()]
        allowed={(Path(WORKSPACE_DIR)/name).resolve() for name in attachments}
        if allowed and source.resolve() not in allowed:
            result=ToolResult.error('source_outside_session_scope','结构工具仅接受当前附件原件')
        elif not params.get('sheets'):
            result=ToolResult.error('invalid_sheet_selection','需要指定真实工作表名')
        else:
            result=spreadsheet_structure(source,params['sheets'],deadline)
    return TextToolOutput(result.render_text(),result)
