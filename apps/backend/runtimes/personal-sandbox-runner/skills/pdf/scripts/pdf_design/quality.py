"""Structural PDF checks and raster previews. Visual approval still needs page inspection."""

from collections import Counter
import hashlib
from pathlib import Path
import subprocess
import unicodedata

import pdfplumber
from pypdf import PdfReader


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if c.isalnum())


def embedded_fonts(page):
    fonts = []
    for ref in (page.get('/Resources', {}).get('/Font', {})).values():
        font = ref.get_object()
        for descendant in font.get('/DescendantFonts', [font]):
            descendant = descendant.get_object()
            descriptor = descendant.get('/FontDescriptor', {})
            descriptor = descriptor.get_object() if hasattr(descriptor, 'get_object') else descriptor
            fonts.append({'name': str(font.get('/BaseFont', '')),
                          'embedded': any(key in descriptor for key in ('/FontFile', '/FontFile2', '/FontFile3'))})
    return fonts


def inspect_pdf(path, expected_text='', min_pages=None, max_pages=None):
    path = Path(path)
    errors, pages = [], []
    reader = PdfReader(path, strict=True)
    count = len(reader.pages)
    if not count:
        errors.append('PDF contains no pages')
    if min_pages is not None and count < min_pages:
        errors.append(f'Expected at least {min_pages} pages, got {count}')
    if max_pages is not None and count > max_pages:
        errors.append(f'Expected at most {max_pages} pages, got {count}')
    pypdf_text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    if '\0' in pypdf_text or '\ufffd' in pypdf_text:
        errors.append('pypdf extraction contains NUL or replacement characters')
    plumber_text = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            plumber_text.append(text)
            if '\0' in text or '\ufffd' in text or '(cid:0)' in text:
                errors.append(f'Page {index + 1}: missing glyph or invalid character mapping')
            outside = [c for c in page.chars if c['x0'] < -.75 or c['x1'] > page.width + .75
                       or c['top'] < -.75 or c['bottom'] > page.height + .75]
            if outside:
                errors.append(f'Page {index + 1}: {len(outside)} text glyphs outside the page')
            fonts = embedded_fonts(reader.pages[index])
            if any(not f['embedded'] for f in fonts):
                errors.append(f'Page {index + 1}: font is not embedded')
            pages.append({'page': index + 1, 'width_pt': round(page.width, 2),
                          'height_pt': round(page.height, 2), 'text_chars': len(text),
                          'text': text, 'outside_page_glyphs': len(outside), 'fonts': fonts})
    # Running headers and table pagination change extraction order. Check source
    # character coverage in each extractor independently, not a substring match.
    expected = Counter(normalized(expected_text))
    for name, text in [('pypdf', pypdf_text), ('pdfplumber', '\n'.join(plumber_text))]:
        missing = expected - Counter(normalized(text))
        if missing:
            errors.append(f'{name}: source text missing {sum(missing.values())} characters (通常因包含 HTML <div>/卡片导致内容被容器边界裁剪，或文字超出纸面；请移除内联 HTML 标签，改用原生 Markdown 标题与列表自然分页，且不可随意删减内容条目)')
        if expected and not normalized(text):
            errors.append(f'{name}: expected text but extraction is empty')
    return {'valid': not errors, 'errors': errors, 'page_count': count,
            'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'pages': pages, 'visual_review': 'required',
            'checks': ['parse', 'page_range', 'text_coverage', 'extraction', 'page_bounds', 'embedded_fonts']}


def render_previews(path, folder, dpi=100):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', str(path), str(folder / 'page')],
                   check=True, capture_output=True, text=True, timeout=60)
    return sorted(folder.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
