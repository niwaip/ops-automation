"""Separate trusted request text from transport attachment descriptions."""

import re


def user_instruction(prompt):
    text = str(prompt or '').strip()
    # Only unwrap the broker's anchored envelope. A quoted “用户指令” inside
    # an ordinary request is user content and must not discard preceding text.
    if re.match(r'^【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】\s*[:：]', text):
        markers = list(re.finditer(r'(?:^|\n)用户指令\s*[:：]\s*', text))
        if markers:
            # Extracted attachment previews precede the broker's final request
            # marker; a marker inside a preview must not become user intent.
            return text[markers[-1].end():].strip()
    return text
