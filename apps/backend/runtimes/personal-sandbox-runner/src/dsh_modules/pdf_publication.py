"""Verify a published PDF against its run-scoped render and page receipts."""
import hashlib
from pathlib import Path


def has_verified_pdf_publication(receipts):
    renders = {}
    reviewed = {}
    for receipt in receipts:
        if not receipt.is_success or not isinstance(receipt.data, dict):
            continue
        data = receipt.data
        path = str(Path(data['file_path']).resolve()) if data.get('file_path') else ''
        key = (path, data.get('sha256'))
        if data.get('kind') == 'pdf_render':
            renders[path] = data
            reviewed[key] = set()
        elif data.get('kind') == 'pdf_page_review':
            render = renders.get(path, {})
            if render.get('sha256') != data.get('sha256'):
                continue
            reviewed.setdefault(key, set()).add(data.get('page'))
    verified = set()
    for receipt in receipts:
        data = receipt.data if receipt.is_success and isinstance(receipt.data, dict) else {}
        if data.get('kind') != 'pdf_page_review' or data.get('published') is not True:
            continue
        path = str(Path(data['file_path']).resolve()) if data.get('file_path') else ''
        render = renders.get(path, {})
        key = (path, data.get('sha256'))
        if render.get('sha256') != data.get('sha256') or type(render.get('page_count')) is not int:
            continue
        if reviewed.get(key) != set(range(1, render['page_count'] + 1)):
            continue
        try:
            if hashlib.sha256(Path(data['file_path']).read_bytes()).hexdigest() == data['sha256']:
                verified.add(path)
        except OSError:
            continue
    return bool(renders) and verified == set(renders)
