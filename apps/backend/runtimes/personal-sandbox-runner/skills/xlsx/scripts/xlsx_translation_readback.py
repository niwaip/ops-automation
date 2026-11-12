"""Check actual output text against the accepted OOXML translation bindings."""
import re
import xml.etree.ElementTree as ET

from xlsx_translation_client import TranslationFailure

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def validate_output_text(archive, mapping, translations):
    trees = {}
    node_lists = {}

    def tree(part):
        if part not in trees:
            trees[part] = ET.fromstring(archive.read(part))
        return trees[part]

    def nodes(part):
        if part not in node_lists:
            node_lists[part] = list(tree(part).iter())
        return node_lists[part]

    def check(key, actual, expected):
        if actual is None or actual.strip() != expected.strip():
            raise TranslationFailure('Output text differs from verified translation: ' + key)

    # Rich-text run keys are addressed through their owning shared string.
    checked_runs = set()
    for key, meta in mapping.items():
        kind = meta.get('type')
        if kind == 'sst' and meta.get('run_keys'):
            strings = tree('xl/sharedStrings.xml')
            runs = strings[meta['si_idx']].findall('m:r', NS)
            if len(runs) != len(meta['run_keys']):
                raise TranslationFailure('Rich text run bindings changed: ' + key)
            for run, run_key in zip(runs, meta['run_keys']):
                checked_runs.add(run_key)
                if run_key in translations:
                    element = run.find('m:t', NS)
                    check(run_key, element.text if element is not None else None, translations[run_key])
            continue
        if key not in translations:
            continue
        expected = translations[key]
        if kind == 'sst':
            strings = tree('xl/sharedStrings.xml')
            element = strings[meta['si_idx']].find('m:t', NS)
            check(key, element.text if element is not None else None, expected)
        elif kind == 'sheet_name':
            sheets = tree('xl/workbook.xml').find('m:sheets', NS)
            clean_name = re.sub(r'[:\\/?*\[\]]', '', expected)[:31].strip()
            check(key, sheets[meta['sheet_idx']].get('name'), clean_name)
        elif kind == 'data_validation':
            rules = tree(meta['rel_file']).findall('.//m:dataValidation', NS)
            formula = rules[meta['dv_idx']].find('m:formula1', NS)
            raw = (formula.text or '') if formula is not None else ''
            options = raw[1:-1].split(',') if raw.startswith('"') and raw.endswith('"') else []
            index = meta['opt_idx']
            check(key, options[index] if index < len(options) else None, expected)
        elif kind == 'inline_string':
            cell = tree(meta['rel_file']).find('.//m:c[@r="' + meta['cell_coord'] + '"]', NS)
            element = cell.find('m:is/m:t', NS) if cell is not None else None
            check(key, element.text if element is not None else None, expected)
        elif kind == 'xml_text':
            elements = nodes(meta['part'])
            index = meta['index']
            check(key, elements[index].text if index < len(elements) else None, expected)
        elif kind not in ('rich_text_run', 'formula_text'):
            raise TranslationFailure('Unsupported output text binding: ' + key)
    for key, meta in mapping.items():
        if key in translations and meta.get('type') == 'rich_text_run' and key not in checked_runs:
            raise TranslationFailure('Unbound rich text translation: ' + key)
    # Formula literals are checked with their containing formulas by the structural validator.
