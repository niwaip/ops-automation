"""Owned generation loop: the model writes prose, the runtime compiles and verifies it."""
from dataclasses import replace
import re
from .llm import call_model_proxy
from .pdf_render_tool import render_pdf
from .pdf_preview_tool import review_current_pdf_pages, pdf_delivery_result
from .pdf_task_contract import bind_pdf_request
from .pdf_workflow import PDF_EDITORIAL_INSTRUCTION

CONTENT_INSTRUCTION = '''你负责撰写可直接打印的PDF正文，程序负责排版与生成文件。
只输出完整Markdown正文，不调用工具，不输出JSON、代码围栏、文件路径、占位语或完成声明。
必须实际写出用户指定的全部段落、清单、表格、问题和空白记录卡。
用户指定每页内容时，用单独一行 <!-- pagebreak --> 分隔整页。两页只插入一次分页。
主标题、副标题和署名由程序排版，正文不要重复。每个小节使用二级标题。
handout讲义尽量每页不超过250个中文字：介绍不超过40字，提示每条不超过16字，表格每格不超过12字。用户指定详细内容或数量优先。
简短介绍一两句；准备清单用Markdown列表；提示语用 > 引用块强调；表格用竖线Markdown格式。
记录卡用两列（项目/内容）表格，第二列留空，程序会保留手写空间。
仅在用户要求叶片示意图时使用 ![叶片示意图](leaf.svg)，不要编造其他图片路径。
引导问题使用编号列表。内容简短、清晰，避免emoji、分隔线、HTML布局和重复工具。
''' + PDF_EDITORIAL_INSTRUCTION


def run_pdf_content_workflow(prompt, model, policy, workspace, skill_dir, deadline, telemetry):
    receipts = []
    bound = bind_pdf_request({'output_path': 'handout.pdf' if 'handout' in prompt.lower() else 'document.pdf'}, prompt)
    messages = [{'role': 'system', 'content': CONTENT_INSTRUCTION}, {'role': 'user', 'content': prompt}]
    for attempt in range(4):
        response = call_model_proxy(messages, model=model, policy=replace(policy, thinking=False),
                                    deadline=deadline, max_tokens=3000, stream_deltas=False,
                                    purpose='main_turn', telemetry=telemetry)
        telemetry.record_llm_response(response, is_first_round=attempt == 0, purpose='pdf_content')
        source = response.get('content', '').strip()
        source = re.sub(r'^```(?:markdown|md)?\s*\n(.*)\n```\s*$', r'\1', source, flags=re.S)
        if response.get('finish_reason') == 'length':
            messages.extend([{'role': 'assistant', 'content': source},
                             {'role': 'user', 'content': '正文被截断。精简措辞，保留全部要求，重新输出完整全文。'}])
            continue
        params = {**bound, 'markdown': source}
        telemetry.checkpoint('tool_started', {'name': 'render_pdf', 'execution_origin': 'runtime_workflow', 'round': attempt})
        result = render_pdf(params, workspace, skill_dir, deadline, user_prompt=prompt).tool_result
        result.provenance.update(execution_origin='runtime_workflow', round=attempt)
        telemetry.record_tool_call('render_pdf', params, result.status)
        telemetry.record_execution_result(result)
        receipts.append(result)
        failures = [result] if result.is_error else []
        if not failures:
            reviews = review_current_pdf_pages(workspace, deadline, telemetry, attempt)
            receipts.extend(reviews)
            failures = [r for r in reviews if r.is_error]
            text, files = pdf_delivery_result()
            if files:
                telemetry.record_guard('pdf_delivery', 'accept', 'all_current_pages_reviewed')
                return text, files, receipts
        messages.extend([{'role': 'assistant', 'content': source},
                         {'role': 'user', 'content': '请修正下列问题，保留全部用户要求并重新输出完整Markdown全文，不解释：\n' +
                          '\n'.join(r.render_text()[:2500] for r in failures)}])
    telemetry.record_guard('pdf_delivery', 'reject', 'owned_content_repair_limit')
    text, files = pdf_delivery_result()
    return text, files, receipts
