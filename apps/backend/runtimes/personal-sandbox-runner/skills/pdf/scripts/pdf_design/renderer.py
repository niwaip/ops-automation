"""Render owned templates with local assets, validate, then atomically publish the PDF."""

import json
import logging
import mimetypes
import os
from pathlib import Path
import tempfile
import time
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from weasyprint import CSS, HTML
from weasyprint.text.fonts import FontConfiguration
from weasyprint.urls import URLFetcherResponse

from .content import load_content
from .quality import inspect_pdf, render_previews
from .themes import design_tokens, installed_fonts
from .symbols import symbol_html
from markupsafe import Markup

SKILL_ROOT = Path(__file__).resolve().parents[2]


class ResourceError(ValueError):
    pass


class LocalResources:
    def __init__(self, roots):
        self.roots = [Path(root).resolve() for root in roots]
        self.errors = []

    def __call__(self, url, *args, **kwargs):
        parsed = urlsplit(url)
        if parsed.scheme == 'data':
            with urlopen(url) as response:
                return URLFetcherResponse(url, body=response.read(), headers=response.info())
        if parsed.scheme != 'file' or parsed.netloc not in ('', 'localhost'):
            self.errors.append(f'External resource blocked; stage it locally first: {url}')
            raise ResourceError(self.errors[-1])
        path = Path(unquote(parsed.path)).resolve()
        if not any(path.is_relative_to(root) for root in self.roots):
            self.errors.append(f'Resource outside source/assets directories: {path}')
            raise ResourceError(self.errors[-1])
        mime_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        return URLFetcherResponse(path.as_uri(), body=path.read_bytes(), headers={'Content-Type': mime_type})


class WarningLog(logging.Handler):
    def __init__(self):
        super().__init__(logging.WARNING)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def render_report(content_lines=None, output_path='/workspace/report.pdf', title='', subtitle='',
                  author='', date_str='', theme=None, *, input_path=None, template='report',
                  accent=None, cover=False, min_pages=None, max_pages=None, preview_dir=None):
    started = time.perf_counter()
    target = Path(output_path).resolve()
    if target.suffix.lower() != '.pdf':
        raise ValueError('Output filename must end in .pdf')
    if input_path and Path(input_path).resolve() == target:
        raise ValueError('Source and output must be different files')
    if (min_pages is not None and min_pages < 1) or (max_pages is not None and max_pages < 1):
        raise ValueError('Page bounds must be positive')
    if min_pages is not None and max_pages is not None and min_pages > max_pages:
        raise ValueError('min-pages must not exceed max-pages')
    text = '\n'.join(line.rstrip('\r\n') for line in content_lines) if content_lines is not None else None
    content = load_content(path=input_path, text=text, title=title, subtitle=subtitle,
                           author=author, date=date_str)
    if not content.text.strip() and '<img ' not in content.body:
        raise ValueError('Document has no body content')
    tokens = design_tokens(template, theme, accent)
    fonts = installed_fonts(tokens)
    source_dir = Path(input_path).resolve().parent if input_path else Path.cwd()
    resources = LocalResources([source_dir, SKILL_ROOT / 'assets'])
    env = Environment(loader=FileSystemLoader(SKILL_ROOT / 'templates'),
                      autoescape=select_autoescape(['html']), undefined=StrictUndefined)
    env.filters['pdf_symbols'] = lambda value: Markup(symbol_html(value))
    html = env.get_template('document.html').render(content=content, tokens=tokens, cover=cover)
    css = env.get_template('print.css').render(**tokens)
    target.parent.mkdir(parents=True, exist_ok=True)
    previews = Path(preview_dir).resolve() if preview_dir else target.parent / '.pdf-preview' / target.stem
    previews.mkdir(parents=True, exist_ok=True)
    (previews / 'document.html').write_text(
        html.replace('</head>', f'<style>{css}</style></head>'), encoding='utf-8')
    warnings = WarningLog()
    logger = logging.getLogger('weasyprint')
    logger.addHandler(warnings)
    try:
        with tempfile.TemporaryDirectory(prefix='.pdf-build-', dir=target.parent) as folder:
            staged = Path(folder) / 'document.pdf'
            font_config = FontConfiguration()
            render_start = time.perf_counter()
            document = HTML(string=html, base_url=source_dir.as_uri() + '/',
                            url_fetcher=resources).render(
                                stylesheets=[CSS(string=css, font_config=font_config,
                                                 url_fetcher=resources)], font_config=font_config)
            document.write_pdf(staged)
            render_ms = (time.perf_counter() - render_start) * 1000
            inspect_start = time.perf_counter()
            report = inspect_pdf(staged, content.title + ' ' + content.text,
                                 min_pages=min_pages, max_pages=max_pages)
            report['errors'].extend(resources.errors)
            report['errors'].extend(warnings.messages)
            report['valid'] = not report['errors']
            report.update(template=template, theme=tokens['theme'], fonts=fonts,
                          warnings=warnings.messages, output=str(target),
                          timings_ms={'render': round(render_ms, 2),
                                      'inspect': round((time.perf_counter() - inspect_start) * 1000, 2)})
            if not report['valid']:
                (previews / 'qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
                raise ValueError('PDF quality checks failed: ' + '; '.join(report['errors']))
            preview_start = time.perf_counter()
            for old in previews.glob('page-*.png'):
                old.unlink()
            images = render_previews(staged, previews)
            if len(images) != report['page_count']:
                raise ValueError('PDF preview page count does not match the final PDF')
            report['previews'] = [str(image) for image in images]
            report['timings_ms']['preview'] = round((time.perf_counter() - preview_start) * 1000, 2)
            report['timings_ms']['total'] = round((time.perf_counter() - started) * 1000, 2)
            report['source'] = str(Path(input_path).resolve()) if input_path else None
            os.replace(staged, target)
            (previews / 'qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    finally:
        logger.removeHandler(warnings)
    print(f'SUCCESS: {target}, pages={report["page_count"]}, size={report["bytes"]}', flush=True)
    print(f'QA: {previews / "qa.json"}; visual_review=required; previews={len(images)}', flush=True)
    return str(target)
