"""Native OOXML and translation acceptance before publishing an XLSX candidate."""
from collections import Counter
import hashlib
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

from xlsx_font_normalization import localize_drawing_fonts_xml, localize_spreadsheet_fonts_xml
from xlsx_formula_references import translate_formula
from xlsx_translation_client import has_frequency_mismatch, has_untranslated_kana, TranslationFailure
from xlsx_translation_readback import validate_output_text

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def _require(condition, message):
    if not condition:
        raise TranslationFailure(message)


def _signature(element, *, omit_text=False):
    if element is None:
        return None
    return (element.tag, tuple(sorted(element.attrib.items())),
            None if omit_text and element.tag.rsplit('}', 1)[-1] == 't' else element.text,
            tuple(_signature(child, omit_text=omit_text) for child in element))


def validate_delivery(source, candidate, mapping, translations, language):
    """Reject stale/missing content or structural changes; this is not visual or semantic QA."""
    counts = Counter()
    text_map = {meta['orig_text']: translations[key] for key, meta in mapping.items()
                if key in translations and isinstance(meta.get('orig_text'), str)}
    expected = {key for key, meta in mapping.items() if meta.get('orig_text', '').strip()
                and not meta.get('run_keys')}
    _require(expected <= translations.keys(), 'Missing translation units')
    _require(all(isinstance(value, str) and value.strip() for value in translations.values()), 'Invalid translation value')
    if language.lower().startswith('zh'):
        _require(not any(has_untranslated_kana(value) for value in translations.values()), 'Untranslated Japanese text remains')
    for key, meta in mapping.items():
        if key not in translations:
            continue
        pref = meta.get('protected_prefix')
        if pref and isinstance(pref, str):
            expected_pref = pref.strip()
            actual = translations[key].strip()
            _require(
                actual.startswith(expected_pref)
                and (len(actual) == len(expected_pref) or not (actual[len(expected_pref)].isascii() and actual[len(expected_pref)].isalnum())),
                'Formula/validation code prefix changed: ' + key,
            )
        orig_text = meta.get('orig_text')
        if isinstance(orig_text, str):
            _require(
                not has_frequency_mismatch(orig_text, translations[key]),
                'Translation changed recurrence frequency: ' + key,
            )
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(candidate) as output:
        _require(set(original.namelist()) == set(output.namelist()), 'Workbook package parts changed')
        _require(output.testzip() is None, 'Corrupt workbook archive')
        before_styles = ET.fromstring(
            localize_spreadsheet_fonts_xml(original.read('xl/styles.xml').decode('utf-8', errors='ignore'), language)
        )
        after_styles = ET.fromstring(output.read('xl/styles.xml'))
        _require(_signature(before_styles) == _signature(after_styles), 'Workbook styles changed')
        before_book = ET.fromstring(original.read('xl/workbook.xml'))
        after_book = ET.fromstring(output.read('xl/workbook.xml'))
        before_sheets = before_book.find('m:sheets', NS)
        after_sheets = after_book.find('m:sheets', NS)
        _require(len(before_sheets) == len(after_sheets), 'Worksheet count changed')
        rename = {a.get('name'): b.get('name') for a, b in zip(before_sheets, after_sheets)}
        _require(len(set(rename.values())) == len(rename), 'Duplicate worksheet names')
        for old, new in zip(before_sheets, after_sheets):
            _require({k: v for k, v in old.attrib.items() if k != 'name'} ==
                     {k: v for k, v in new.attrib.items() if k != 'name'}, 'Worksheet bindings changed')
        for name in original.namelist():
            if name.startswith('xl/media/'):
                _require(original.read(name) == output.read(name), 'Image bytes changed: ' + name)
            if not name.endswith('.xml'):
                continue
            raw_before = original.read(name)
            if name.startswith(('xl/drawings/', 'xl/charts/')):
                raw_before = localize_drawing_fonts_xml(
                    raw_before.decode('utf-8', errors='ignore'), language
                ).encode('utf-8')
            elif name == 'xl/sharedStrings.xml':
                raw_before = localize_spreadsheet_fonts_xml(
                    raw_before.decode('utf-8', errors='ignore'), language
                ).encode('utf-8')
            before = ET.fromstring(raw_before)
            after = ET.fromstring(output.read(name))
            if name.startswith(('xl/drawings/', 'xl/charts/')):
                _require(_signature(before, omit_text=True) == _signature(after, omit_text=True),
                         'Drawing geometry or styles changed: ' + name)
            if name == 'xl/sharedStrings.xml':
                _require(len(before) == len(after), 'Shared string indices changed')
                for old, new in zip(before, after):
                    old_runs, new_runs = old.findall('m:r', NS), new.findall('m:r', NS)
                    _require(len(old_runs) == len(new_runs), 'Rich text runs changed')
                    for old_run, new_run in zip(old_runs, new_runs):
                        _require(_signature(old_run.find('m:rPr', NS)) == _signature(new_run.find('m:rPr', NS)),
                                 'Rich text style changed')
                        if ''.join(old_run.itertext()).strip():
                            _require((new_run.find('m:t', NS).text or '').strip(), 'Rich text segment lost')
                        counts['rich_text_runs'] += 1
            if not name.startswith('xl/worksheets/'):
                continue
            for tag in ('c', 'f', 'mergeCell', 'dataValidation', 'conditionalFormatting', 'pane'):
                a, b = before.findall('.//m:' + tag, NS), after.findall('.//m:' + tag, NS)
                _require(len(a) == len(b), tag + ' count changed: ' + name)
                counts[tag] += len(b)
            for tag in ('cols', 'sheetFormatPr', 'mergeCells', 'pane', 'pageMargins', 'pageSetup', 'sheetProtection'):
                _require([_signature(item) for item in before.findall('.//m:' + tag, NS)] ==
                         [_signature(item) for item in after.findall('.//m:' + tag, NS)], tag + ' changed: ' + name)
            for old, new in zip(before.findall('.//m:row', NS), after.findall('.//m:row', NS)):
                _require(old.attrib == new.attrib, 'Row dimensions changed')
            for old, new in zip(before.findall('.//m:c', NS), after.findall('.//m:c', NS)):
                _require(old.attrib == new.attrib, 'Cell bindings or style changed')
                previous_value, current_value = old.find('m:v', NS), new.find('m:v', NS)
                if old.get('t') == 'str' and old.find('m:f', NS) is not None and previous_value is not None:
                    value = previous_value.text or ''
                    expected_value = (re.match(r'^\s*', value).group(0) + text_map[value].strip()
                                      + re.search(r'\s*$', value).group(0)) if value in text_map else value
                    _require(current_value is not None and (current_value.text or '') == expected_value,
                             'Formula text cache differs from verified translation')
                    counts['localized_formula_text_caches'] += expected_value != value
                else:
                    _require(_signature(previous_value) == _signature(current_value), 'Numeric or unrelated cell caches changed')
            for tag in ('f', 'formula', 'formula1', 'formula2'):
                for old, new in zip(before.findall('.//m:' + tag, NS), after.findall('.//m:' + tag, NS)):
                    if tag == 'formula1' and (old.text or '').startswith('"'):
                        continue  # Literal dropdown options have separate translation keys.
                    _require(translate_formula(old.text or '', rename, text_map) == (new.text or ''),
                             'Formula dependency mismatch: ' + name)
        validate_output_text(output, mapping, translations)
    return dict(schema='xlsx-quality/3', passed=True, input_sha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                output_sha256=hashlib.sha256(Path(candidate).read_bytes()).hexdigest(),
                sheets=len(rename), native_features=dict(counts), translation_units=len(translations),
                text_readback_verified=True, recalc='on_open', visual_reviewed=False, semantic_reviewed=False)
