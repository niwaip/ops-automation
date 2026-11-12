"""Opaque numeric spans: the model translates prose, the engine preserves facts."""
from collections import Counter
import hashlib
import json
import re

NUMBER = re.compile(r'\d+(?:[.,]\d+)*')
MARKER = re.compile(r'__PDF_NUM_[0-9a-f]{12}_[0-9]+__')


class ProtectedResponse(dict):
    def __init__(self, values, errors):
        super().__init__(values)
        self.validation_errors = errors


def protect_prompt(prompt):
    head, separator, body = prompt.rpartition('\nInput:\n')
    if not separator:
        raise ValueError('translation input mapping missing')
    values = json.loads(body)
    maps = {}
    encoded = {}
    for key, value in values.items():
        replacements = {}
        signature = hashlib.sha256((key + value).encode()).hexdigest()[:12]
        def replace(match):
            token = f'__PDF_NUM_{signature}_{len(replacements)}__'
            replacements[token] = match.group()
            return token
        encoded[key] = NUMBER.sub(replace, value)
        maps[key] = replacements
    instruction = ('\nNumeric spans are protected opaque tokens of the form __PDF_NUM_*__. '
        'Copy EVERY token exactly once, at the corresponding semantic position. '
        'Never omit footnote/citation tokens even when they appear between word fragments. '
        'When a token is followed by an English ordinal suffix (e.g. __PDF_NUM_*__th Century), '
        'translate the surrounding word/suffix using the token directly (e.g. __PDF_NUM_*__世纪) '
        'without prepending or appending extra digits to the token. '
        'Do not translate, shorten, duplicate or replace a token with digits.\n')
    instruction += 'Allowed tokens by ID: ' + json.dumps({k: list(v) for k, v in maps.items()}) + '\n'
    return head + instruction + separator + json.dumps(encoded, ensure_ascii=False), maps


def restore_response(values, maps):
    decoded, errors = dict(values), {}
    for key, mapping in maps.items():
        text = values.get(key)
        if not isinstance(text, str):
            continue
        missing = [token for token in mapping if text.count(token) == 0]
        duplicated = [token for token in mapping if text.count(token) > 1]
        unknown = set(MARKER.findall(text)) - set(mapping)
        residue = MARKER.sub('', text)
        malformed = '__PDF_NUM_' in residue
        if missing and not (duplicated or unknown or malformed):
            if Counter(NUMBER.findall(residue)) == Counter(mapping[t] for t in missing):
                missing = []
        if missing or duplicated or unknown or malformed:
            errors[key] = ('protected numeric tokens invalid: '
                + json.dumps(dict(missing=missing, duplicated=duplicated, unknown=sorted(unknown),
                                  malformed=malformed), ensure_ascii=False))
            continue
        for token in mapping:
            value = mapping[token]
            text = re.sub(
                rf'(?<![0-9a-f_])(\d+)(?={re.escape(token)})',
                lambda m, v=value: '' if v.startswith(m.group(1)) else m.group(1),
                text,
            )
        for token, value in mapping.items():
            text = text.replace(token, value)
        decoded[key] = text
    return ProtectedResponse(decoded, errors)
