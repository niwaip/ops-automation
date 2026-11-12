"""Keep worksheet references and text comparisons valid during localization."""
import html
from pathlib import Path
import re
from xml.sax.saxutils import escape


STRING = re.compile(r'("(?:[^"]|"")*")')
SHEET = re.compile(r"(?<![\w.\]])('(?:[^']|'')*'|[\w\u0080-\uffff]+)!")
FORMULA = re.compile(
    r'(<(?P<tag>(?:[\w]+:)?(?:f|formula|formula1|formula2|definedName))\b[^>]*>)'
    r'(?P<body>[^<]*)(</(?P=tag)>)'
)


def translate_formula(formula, sheet_names, text_translations):
    def reference(match):
        name = match.group(1)
        original = name[1:-1].replace("''", "'") if name.startswith("'") else name
        if original not in sheet_names:
            return match.group(0)
        return "'" + sheet_names[original].replace("'", "''") + "'!"

    parts = STRING.split(formula)
    for index, part in enumerate(parts):
        if index % 2:
            original = part[1:-1].replace('""', '"')
            translated = text_translations.get(original, original)
            parts[index] = '"' + translated.replace('"', '""') + '"'
        else:
            parts[index] = SHEET.sub(reference, part)
    return ''.join(parts)


def _extract_prefixes_from_formula(formula, prefixes):
    for match in STRING.finditer(formula or ''):
        literal = match.group(1)[1:-1].replace('""', '"').strip()
        if not literal or literal.startswith(('http://', 'https://')):
            continue
        if literal.endswith(('*', '?')):
            stem = literal.rstrip('*?').strip()
            if stem and len(stem) <= 12 and not any(ch.isspace() for ch in stem):
                prefixes.add(stem)
                code = re.match(r'^([A-Za-z0-9]+)', stem)
                if code:
                    prefixes.add(code.group(1))
        elif re.match(r'^[A-Za-z0-9][A-Za-z0-9_./-]{0,11}$', literal):
            prefixes.add(literal)


def extract_referenced_prefixes(folder):
    """Extract leading code prefixes referenced by formula/CF string criteria."""
    prefixes = set()
    xl_root = Path(folder, 'xl')
    if not xl_root.is_dir():
        return prefixes
    for path in xl_root.rglob('*.xml'):
        source = path.read_text(encoding='utf-8', errors='ignore')
        for match in FORMULA.finditer(source):
            tag = match.group('tag').rsplit(':', 1)[-1]
            body = html.unescape(match.group('body')).strip()
            if not body:
                continue
            if tag == 'formula1' and body.startswith('"') and body.endswith('"'):
                continue
            _extract_prefixes_from_formula(body, prefixes)
    return prefixes


_DV_CODE_PREFIX_RE = re.compile(
    r'^([A-Za-z][A-Za-z0-9_./-]{0,7}\s*)(?=[（(\[【：:\-/／])(.+)$',
    re.DOTALL,
)


def extract_validation_code_prefixes(folder):
    """Extract ASCII letter code prefixes from dropdown literal options like 'N（その他）'."""
    prefixes = set()
    ws_dir = Path(folder, 'xl', 'worksheets')
    if not ws_dir.is_dir():
        return prefixes
    for path in sorted(ws_dir.glob('*.xml')):
        source = path.read_text(encoding='utf-8', errors='ignore')
        for match in FORMULA.finditer(source):
            if match.group('tag').rsplit(':', 1)[-1] != 'formula1':
                continue
            body = html.unescape(match.group('body')).strip()
            if not (body.startswith('"') and body.endswith('"')):
                continue
            for opt in body[1:-1].split(','):
                clean = opt.strip()
                m = _DV_CODE_PREFIX_RE.match(clean)
                if m and any(ord(ch) >= 128 for ch in m.group(2)):
                    prefixes.add(m.group(1).rstrip())
    return prefixes


def split_protected_prefix(text, referenced_prefixes, *, is_data_validation=False):
    """Split a protected code prefix (and trailing ASCII separator spaces) from translatable text."""
    if not isinstance(text, str) or not text:
        return '', text
    stripped = text.lstrip()
    if not stripped or stripped.startswith(('http://', 'https://')):
        return '', text

    best = ''
    for pref in sorted((referenced_prefixes or ()), key=len, reverse=True):
        if not pref or not stripped.startswith(pref) or len(stripped) <= len(pref):
            continue
        boundary = stripped[len(pref)]
        if boundary.isascii() and boundary.isalnum():
            continue
        ws_len = len(stripped[len(pref):]) - len(stripped[len(pref):].lstrip(' '))
        end = len(pref) + ws_len
        # Only split a code label, never prose or a column range such as C-D列.
        marker = re.match(r'[*＊?？]*', stripped[end:]).group(0)
        end += len(marker)
        if not stripped[end:].startswith(('（', '(', '[', '【', '：', ':')):
            continue
        candidate = stripped[:end]
        remainder = stripped[len(candidate):]
        if remainder.strip():
            best = candidate
            break

    if not best and is_data_validation:
        m = _DV_CODE_PREFIX_RE.match(stripped)
        if m and any(ord(ch) >= 128 for ch in m.group(2)):
            best = m.group(1)

    if not best:
        return '', text
    remainder = stripped[len(best):]
    if not remainder.strip():
        return '', text
    return best, remainder


def apply_protected_prefix(prefix, translated_text):
    """Reattach protected prefix cleanly without duplicating if already retained."""
    if not prefix:
        return translated_text
    text = (translated_text or '').strip()
    clean_pref = prefix.strip()
    if text.startswith(clean_pref):
        rest = text[len(clean_pref):]
        if not rest or not (rest[0].isascii() and rest[0].isalnum()):
            return prefix + rest.lstrip(' ')
    return prefix + text


def _sync_docprops_sheet_titles(folder, sheet_names):
    app_path = Path(folder, 'docProps', 'app.xml')
    if not sheet_names or not app_path.is_file():
        return 0
    source = app_path.read_text(encoding='utf-8')
    parts_re = re.compile(r'(<(?:\w+:)?TitlesOfParts\b[^>]*>)(.*?)(</(?:\w+:)?TitlesOfParts>)', re.DOTALL)
    lpstr_re = re.compile(r'(<(?:\w+:)?lpstr\b[^>]*>)([^<]*)(</(?:\w+:)?lpstr>)')

    def replace_parts(match):
        def replace_item(item_m):
            raw = html.unescape(item_m.group(2))
            if raw not in sheet_names:
                return item_m.group(0)
            return item_m.group(1) + escape(sheet_names[raw]) + item_m.group(3)
        return match.group(1) + lpstr_re.sub(replace_item, match.group(2)) + match.group(3)

    updated = parts_re.sub(replace_parts, source)
    if updated != source:
        app_path.write_text(updated, encoding='utf-8')
        return 1
    return 0


def update_package_references(folder, sheet_names, text_translations):
    """Patch formula text without reserializing OOXML or dropping extensions."""
    changed = 0
    for path in Path(folder, 'xl').rglob('*.xml'):
        source = path.read_text(encoding='utf-8')

        def replace(match):
            value = html.unescape(match.group('body'))
            updated = translate_formula(value, sheet_names, text_translations)
            if updated == value:
                return match.group(0)
            return match.group(1) + escape(updated) + match.group(4)

        updated = FORMULA.sub(replace, source)
        def hyperlink(match):
            def attribute(attr):
                value = html.unescape(attr.group(2))
                if attr.group(1) == 'location':
                    value = translate_formula(value, sheet_names, {})
                else:
                    value = text_translations.get(value, value)
                return attr.group(1) + '="' + escape(value, {'"': '&quot;'}) + '"'
            return re.sub(r'\b(location|display)="([^"]*)"', attribute, match.group(0))
        updated = re.sub(r'<(?:\w+:)?hyperlink\b[^>]*>', hyperlink, updated)
        if path.name == 'workbook.xml':
            # Preserve native features; Excel refreshes cached results on open.
            def recalculate(match):
                tag = re.sub(r'\s(?:fullCalcOnLoad|forceFullCalc)="[^"]*"', '', match.group(0))
                return tag[:-2] + ' fullCalcOnLoad="1" forceFullCalc="1"/>'
            updated = re.sub(r'<calcPr\b[^>]*/>',
                             recalculate, updated)
        if updated != source:
            path.write_text(updated, encoding='utf-8')
            changed += 1
    changed += _sync_docprops_sheet_titles(folder, sheet_names)
    return changed
