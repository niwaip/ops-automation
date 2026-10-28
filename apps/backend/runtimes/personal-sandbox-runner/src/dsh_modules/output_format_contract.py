"""Keep explicit user output formats independent of model and skill selection."""
import re

from .intent_contract import extract_source_and_target_artifacts


def requested_output_formats(request, users=(), relation='standalone'):
    texts = [request]
    if relation == 'followup':
        texts.extend(reversed(users))
    for text in texts:
        command = str(text or '').split('用户指令：')[-1]
        command = re.sub(r'^(?:改成|改为|换成|换为|调整为|替换为)', '生成', command.strip())
        _, formats, _ = extract_source_and_target_artifacts(command)
        if not formats:
            continue
        # A chart may imply HTML, but an explicitly requested office file owns
        # its format. HTML is additional only when the user actually names it.
        web = bool(re.search(r'html|网页|网页版|web\s*(?:slides?|deck)', command, re.I))
        web_deck = bool(re.search(
            r'(?:html|网页|网页版)\s*(?:格式|形式|版|的|交互式)*\s*(?:ppt|幻灯片|演示文稿)',
            command, re.I))
        if web_deck and not re.search(r'\.pptx\b|原生|标准\s*(?:ppt|PowerPoint)', command, re.I):
            formats = [f for f in formats if f != '.pptx']
            if '.html' not in formats:
                formats.append('.html')
        elif any(f in formats for f in ('.pptx', '.docx', '.xlsx', '.pdf')) and not web:
            formats = [f for f in formats if f != '.html']
        return formats
    return []
