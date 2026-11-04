"""Owned generation loop: the model writes prose, the runtime compiles and verifies it."""
from dataclasses import replace
import json
import math
from pathlib import Path
import re
from .llm import call_model_proxy
from .pdf_render_tool import render_pdf
from .pdf_preview_tool import review_current_pdf_pages, pdf_delivery_result
from .pdf_task_contract import bind_pdf_request
from .pdf_workflow import PDF_EDITORIAL_INSTRUCTION

CONTENT_INSTRUCTION = '''你负责完整正文，程序负责排版和生成文件。
只输出完整Markdown正文，页数以请求为准；页与页之间独立写一行 <!-- pagebreak -->。
不输出JSON、页码、元信息、代码围栏或完成声明；每页的小标题与内容按用户要求分组。
必须保留用户全部栏目、数量、表格、插图和问题。每个小节使用明确标题。
字数以读者和页数为依据，表述简洁但不删要求。清单用Markdown列表，问题用编号列表。
提示语按要求用 > 引用块；表格用竖线格式。空白记录区用两列表格（字段/空白），每行一个用户字段，第二列留空；不要用连续空行代替填写空间。
只在用户要求且素材目录匹配时引用本地图片，使用 ![说明](目录中的文件名) 语法，不因素材存在而添加无关插图；不要用内联SVG或字符画代替要求的图片。
''' + PDF_EDITORIAL_INSTRUCTION


def content_budget(bound, policy):
    pages = bound.get('max_pages', 2)
    return min(policy.max_tokens, max(2400, pages * 1600)), min(6, 3 + math.ceil(pages / 4))


def content_parameters(source, bound):
    source = re.sub(r'^```(?:json|markdown|md)?\s*\n(.*)\n```\s*$', r'\1', source.strip(), flags=re.S)
    if source.startswith('{'):
        value = json.loads(source, strict=False)
        if set(value) != {'pages'}:
            raise ValueError('仅返回包含完整 pages 数组的对象')
        pages = value['pages']
        if isinstance(pages, list):
            pages = [page for page in pages if not isinstance(page, str) or page.strip()]
        return {**bound, 'pages': pages}
    # Preserve compatibility with providers that emit Markdown despite the JSON instruction.
    return {**bound, 'markdown': source}




def _is_rejection_or_system_error(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    rejection_markers = (
        '尚未通过验收',
        '未通过验收',
        '未发布新的交付文件',
        '未通过内容预检',
        '未通过内容、分页与逐页预览验收',
        '页面内容修复已达3个版本',
        '验收服务或运行时异常',
        '执行异常',
        '抱歉，处理您的请求时出现异常',
    )
    return any(marker in text for marker in rejection_markers)


def _find_prior_user_task(conversation_history):
    """Find the most recent substantive user request in history."""
    if not conversation_history:
        return ''
    retry_re = re.compile(
        r'^(?:重新生成|重新做|重做|重试|再试一次|再生成|重新导出|重写)(?:\s*(?:一份|一个)?\s*(?:pdf|word|excel|ppt|文档|文件)?)?$',
        re.I
    )
    for m in reversed(conversation_history[:-1]):
        if m.get('role') == 'user':
            content = str(m.get('content') or '').strip()
            if content and not retry_re.match(content) and len(content) >= 6:
                return content
    return ''


def run_pdf_content_workflow(prompt, model, policy, workspace, skill_dir, deadline, telemetry, conversation_history=None):
    receipts = []
    user_prompt_content = prompt
    effective_prompt = prompt
    if conversation_history:
        prior_assistant = next((
            m.get('content', '') for m in reversed(conversation_history[:-1])
            if m.get('role') == 'assistant' and isinstance(m.get('content'), str) and m.get('content').strip()
        ), '')
        prior_user_task = _find_prior_user_task(conversation_history)
        is_brief_prompt = len(prompt.strip()) < 35
        is_pure_export = bool(re.search(
            r'^(?:重新生成|重新做|重做|重试|再试一次|再生成|重新导出|重写|生成|导出|制作|做成|转成|输出|保存为|转为|转换成)\s*(?:一份|一个|成|为)?\s*(?:可下载的)?\s*(?:pdf|word|excel|ppt|docx|xlsx|pptx|html)?(?:\s*文件|\s*文档|\s*表格|\s*演示文稿|\s*报告)?$',
            prompt.strip(), re.I
        ))

        if prior_assistant and _is_rejection_or_system_error(prior_assistant):
            # Previous turn was an acceptance failure or rejection notice; never treat it as content!
            reason_match = re.search(r'原因[：:]([^\n]+)', prior_assistant)
            failure_reason = reason_match[1].strip() if reason_match else ''
            failure_reason = re.sub(r'💡.*$', '', failure_reason).strip()

            if prior_user_task:
                effective_prompt = f"{prior_user_task} {prompt}"
                reason_directive = (
                    f"\n\n【前序验收未通过原因及改进要求】：\n"
                    f"{failure_reason}。\n"
                    f"请特别注意针对性扩充正文内容结构与各章节细节，合理增加小节、清单与说明，确保正文篇幅达到全部页数与排版规范，严禁脱离主题编造无关指引！"
                    if failure_reason else ""
                )
                user_prompt_content = (
                    f"【核心生成任务（请严格根据以下用户原始要求与主题编写完整正文并排版）：】\n"
                    f"{prior_user_task}\n\n"
                    f"【用户重新生成指示】：{prompt}"
                    f"{reason_directive}"
                )
        elif prior_assistant and (is_brief_prompt or is_pure_export):
            if prior_user_task and ('页' in prior_user_task or 'handout' in prior_user_task.lower() or '暖色' in prior_user_task):
                effective_prompt = f"{prior_user_task} {prompt}"
            cleaned_prior = re.sub(r'(?ms)\n*---\n*\*\*说明\*\*：.*$', '', prior_assistant)
            cleaned_prior = re.sub(r'(?ms)\n*(?:注意|说明|提示)[：:].*?请使用.*$', '', cleaned_prior).strip()
            if cleaned_prior:
                user_prompt_content = (
                    f"{prompt}\n\n"
                    f"【前序会话正文资料（用户要求基于此内容排版生成 PDF，请提取并排版以下核心内容，保留关键事实与数据，不要编造无关指引）：】\n"
                    f"{cleaned_prior[:8000]}"
                )

    bound = bind_pdf_request({'output_path': 'handout.pdf' if 'handout' in effective_prompt.lower() else 'document.pdf'},
                             effective_prompt, deadline=deadline, model=model, policy=policy, telemetry=telemetry)
    assets = sorted(p.name for p in (Path(skill_dir) / 'pdf/examples').glob('*.svg') if p.is_file() and not p.is_symlink())
    density = 'handout每页正文建议200–350个中文字，简介1–2句，清单与表格每项一个短句；用户指定细节优先。' if bound.get('template') == 'handout' else ''
    instruction = CONTENT_INSTRUCTION + density + '\n可用本地素材（文件名，不代表必须使用）：' + ', '.join(assets)
    tokens, attempts = content_budget(bound, policy)
    messages = [{'role': 'system', 'content': instruction}, {'role': 'user', 'content': user_prompt_content}]
    for attempt in range(attempts):
        response = call_model_proxy(messages, model=model, policy=replace(policy, thinking=False),
                                    deadline=deadline, max_tokens=tokens, stream_deltas=False,
                                    purpose='main_turn', telemetry=telemetry)
        telemetry.record_llm_response(response, is_first_round=attempt == 0, purpose='pdf_content')
        source = response.get('content', '').strip()
        source = re.sub(r'^```(?:markdown|md)?\s*\n(.*)\n```\s*$', r'\1', source, flags=re.S)
        if response.get('finish_reason') == 'length':
            messages.extend([{'role': 'assistant', 'content': source},
                             {'role': 'user', 'content': '正文被截断。精简措辞，保留全部要求，重新输出完整全文。'}])
            continue
        try:
            params = content_parameters(source, bound)
        except (ValueError, TypeError) as error:
            telemetry.record_guard('pdf_content_contract', 'reject', str(error)[:300])
            messages.extend([{'role': 'assistant', 'content': source}, {'role': 'user', 'content': '正文格式错误：' + str(error) + '。请改为完整Markdown，不再输出JSON，页间写 <!-- pagebreak -->。'}])
            continue
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
            if any(r.error_code != 'pdf_preview_failed' for r in failures):
                telemetry.record_guard('pdf_delivery', 'reject', 'page_review_service_or_budget')
                text, files = pdf_delivery_result()
                return text, files, receipts
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
