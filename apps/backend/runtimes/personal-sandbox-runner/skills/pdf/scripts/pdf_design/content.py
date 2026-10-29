"""Normalize Markdown and structured blocks without coupling content to page geometry."""

from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import json
import re

import markdown
from .symbols import render_symbols


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain_text(html):
    parser = PlainText()
    parser.feed(html)
    return ' '.join(parser.parts).strip()


@dataclass
class Content:
    body: str
    title: str
    subtitle: str = ''
    author: str = ''
    date: str = ''
    language: str = 'zh-CN'

    @property
    def text(self):
        return plain_text(self.body)


def markdown_html(text):
    # HTML is supported for deliberate page breaks and local illustrations.
    # Resource access is enforced by the renderer, not by the Markdown parser.
    text = re.sub(r'^\s*<!--\s*pagebreak\s*-->\s*$',
                  '<div class="page-break"></div>', text, flags=re.M)
    text = re.sub(r'(?m)^(\s*[-*+]\s+)\[([ xX])\]\s+',
                  lambda m: m[1] + '<span class="print-checkbox">' + ('✓' if m[2].lower() == 'x' else '') + '</span> ', text)
    text = re.sub(r'<div\s+class="((?:grid-2|grid-2-1|card)(?:\s[^"]*)?)"\s*>',
                  r'<div class="\1" markdown="1">', text)
    rendered = markdown.markdown(text, extensions=['tables', 'fenced_code', 'sane_lists', 'md_in_html'])
    rendered = render_symbols(rendered)
    return rendered.replace('<li><span class="print-checkbox">', '<li class="checklist-item"><span class="print-checkbox">')


def from_markdown(text, **overrides):
    title = ''
    match = re.search(r'^#[ \t]+([^\r\n]+)', text, re.M)
    if match:
        heading = re.sub(r'\s+#+\s*$', '', match.group(1)).strip()
        title = plain_text(markdown.markdown(heading))
        text = text[:match.start()] + text[match.end():]
    return Content(body=markdown_html(text), title=overrides.pop('title', '') or title or '文档',
                   **overrides)


def block_html(block):
    if not isinstance(block, dict):
        raise ValueError('Each content block must be an object')
    kind = block.get('type')
    text = escape(str(block.get('text', '')))
    if kind == 'heading':
        level = int(block.get('level', 2))
        if level not in (2, 3, 4):
            raise ValueError('Heading level must be 2, 3 or 4')
        return f'<h{level}>{text}</h{level}>'
    if kind == 'paragraph':
        return f'<p>{text}</p>'
    if kind == 'markdown':
        return markdown_html(str(block.get('text', '')))
    if kind in ('quote', 'callout'):
        return f'<blockquote><p>{text}</p></blockquote>'
    if kind == 'list':
        tag = 'ol' if block.get('ordered') else 'ul'
        return f'<{tag}>' + ''.join(f'<li>{escape(str(v))}</li>' for v in block['items']) + f'</{tag}>'
    if kind == 'table':
        headers, rows = block['headers'], block['rows']
        if not headers or any(len(row) != len(headers) for row in rows):
            raise ValueError('Table rows must match the non-empty header width')
        head = ''.join(f'<th>{escape(str(v))}</th>' for v in headers)
        body = ''.join('<tr>' + ''.join(f'<td>{escape(str(v))}</td>' for v in row) + '</tr>'
                       for row in rows)
        caption = escape(str(block.get('caption', '')))
        return f'<table><caption>{caption}</caption><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'
    if kind == 'image':
        path = escape(str(block['path']), quote=True)
        caption = escape(str(block.get('caption', '')))
        return f'<figure><img src="{path}" alt="{caption}"><figcaption>{caption}</figcaption></figure>'
    if kind == 'pagebreak':
        return '<div class="page-break"></div>'
    raise ValueError(f'Unsupported PDF content block: {kind!r}')


def load_content(path=None, text=None, **overrides):
    if path and Path(path).suffix.lower() == '.json':
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('blocks'), list):
            raise ValueError('JSON input must contain a blocks array')
        meta = {k: str(data.get(k, '')) for k in ('title', 'subtitle', 'author', 'date')}
        meta['title'] = meta['title'] or '文档'
        meta['language'] = str(data.get('language', 'zh-CN'))
        meta.update({k: v for k, v in overrides.items() if v})
        return Content(body=render_symbols('\n'.join(block_html(b) for b in data['blocks'])), **meta)
    if text is None:
        text = Path(path).read_text(encoding='utf-8')
    return from_markdown(text, **{k: v for k, v in overrides.items() if v})
