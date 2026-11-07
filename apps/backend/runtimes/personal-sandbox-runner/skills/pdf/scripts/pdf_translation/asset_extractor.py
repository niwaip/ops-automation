"""Crop complete visual regions, including vector paths and original labels."""
from pathlib import Path

from PIL import Image
from .contracts import TranslationError, digest


def extract_assets(ir, folder):
    folder = Path(folder)
    assets = folder / 'assets'
    assets.mkdir(exist_ok=True)
    pages = {p['id']: p for p in ir['pages']}
    from .region_validation import validate_regions
    for page in ir['pages']:
        page_nodes = [n for n in ir['nodes'] if n['page_id'] == page['id'] and 'bbox' in n]
        if page_nodes:
            validate_regions(page_nodes, page)
    existing_assets = {a['id']: a for a in ir.get('assets', [])}
    for node in ir['nodes']:
        if node['type'] not in ('figure', 'formula') or 'bbox' not in node:
            continue
        page = pages[node['page_id']]
        preview_path = page.get('preview')
        if not preview_path or not Path(preview_path).is_file():
            continue
        with Image.open(preview_path) as image:
            sx, sy = image.width / page['width_pt'], image.height / page['height_pt']
            box = node['bbox']
            crop = image.crop((int(box[0] * sx), int(box[1] * sy),
                               int(box[2] * sx + 1), int(box[3] * sy + 1)))
            if crop.width < 8 or crop.height < 8:
                raise TranslationError('asset_mapping_failed', '图形区域过小：' + node['id'])
            path = assets / (node['id'] + '.png')
            crop.save(path)
        node['asset'] = str(path)
        existing_assets[node['id']] = {'id': node['id'], 'path': str(path), 'sha256': digest(path)}
    ir['assets'] = list(existing_assets.values())
    return ir
