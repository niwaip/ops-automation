"""Offline SVG bar charts and independent DOM/data validation; no model or network."""
from decimal import Decimal
from html import escape
import json
from xml.etree import ElementTree as ET


def render_bar_chart(dataset):
    points = dataset['points']
    values = [Decimal(p['value']) for p in points]
    low, high = min([Decimal(0), *values]), max([Decimal(0), *values])
    span = high - low or Decimal(1)
    width, left, top, plot_height = max(800, len(points) * 120 + 100), 80, 60, 320
    slot = (width - 120) / max(1, len(points))
    y = lambda value: top + float((high - value) / span) * plot_height
    baseline = y(Decimal(0))
    bars, rows = [], []
    for i, (point, value) in enumerate(zip(points, values)):
        x, bar_width = left + i * slot + slot * .18, slot * .64
        bar_top, height = min(y(value), baseline), abs(y(value) - baseline)
        label, raw = escape(point['label']), escape(point['value'])
        bars.append(f'<g data-point="{i}" data-label="{label}" data-value="{raw}">'
                    f'<rect x="{x:.3f}" y="{bar_top:.3f}" width="{bar_width:.3f}" height="{height:.3f}" fill="#2563eb"><title>{label}：{raw} {escape(dataset["unit"])}</title></rect>'
                    f'<text x="{x + bar_width / 2:.3f}" y="{bar_top - 8:.3f}" text-anchor="middle">{raw}</text>'
                    f'<text x="{x + bar_width / 2:.3f}" y="420" text-anchor="middle">{label}</text></g>')
        rows.append(f'<tr data-row="{i}"><td>{label}</td><td>{raw}</td></tr>')
    # XHTML is valid HTML and also allows a strict, dependency-free acceptance parser.
    metadata = (json.dumps(dataset, ensure_ascii=False, sort_keys=True)
                .replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e"))
    return ('<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN"><head>'
            '<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
            f'<title>{escape(dataset["title"])}</title><style>'
            'body{font:16px/1.6 system-ui,sans-serif;background:#f4f7fb;color:#172033;margin:0}'
            'main{max-width:1200px;margin:32px auto;padding:28px;background:white;border-radius:16px}'
            '.chart{overflow:auto}svg{min-width:800px;width:100%;height:auto}text{font-size:13px;fill:#172033}'
            'table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}'
            '</style></head><body><main>'
            f'<h1>{escape(dataset["title"])}</h1><p>单位：{escape(dataset["unit"])}</p>'
            f'<div class="chart"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="柱状图" viewBox="0 0 {width} 460">'
            f'<line x1="80" x2="{width-40}" y1="{baseline:.3f}" y2="{baseline:.3f}" stroke="#64748b"/>'
            + ''.join(bars) + '</svg></div>'
            f'<table><thead><tr><th>{escape(dataset["category_field"])}</th><th>{escape(dataset["value_label"])}</th></tr></thead><tbody>'
            + ''.join(rows) + '</tbody></table>'
            f'<p>来源：{escape(dataset["source_name"])}；范围：{escape(dataset["source_range"])}。</p>'
            f'<p>筛选条件：{escape(json.dumps(dataset["where"], ensure_ascii=False))}</p>'
            f'<script id="chart-data" type="application/json">{metadata}</script>'
            '</main></body></html>')


def validate_bar_chart(document, dataset):
    root = ET.fromstring(document)
    local = lambda node: node.tag.rsplit('}', 1)[-1]
    metadata = [n for n in root.iter() if local(n) == 'script']
    if len(metadata) != 1 or metadata[0].get('id') != 'chart-data' or metadata[0].get('type') != 'application/json':
        raise ValueError('unexpected_script')
    if json.loads(metadata[0].text) != dataset:
        raise ValueError('chart_data_mismatch')
    if any(n.get('src') or n.get('href') or any(k.lower().startswith('on') for k in n.attrib) for n in root.iter()):
        raise ValueError('external_or_executable_content')
    bars = [n for n in root.iter() if local(n) == 'g' and 'data-point' in n.attrib]
    rows = [n for n in root.iter() if local(n) == 'tr' and 'data-row' in n.attrib]
    if len(bars) != len(dataset['points']) or len(rows) != len(bars):
        raise ValueError('chart_group_count_mismatch')
    # Check actual rendered geometry, including signs and zero values, not just metadata.
    values = [Decimal(p['value']) for p in dataset['points']]
    low, high = min([Decimal(0), *values]), max([Decimal(0), *values])
    span = high - low or Decimal(1)
    for i, (bar, row, point) in enumerate(zip(bars, rows, dataset['points'])):
        if bar.get('data-point') != str(i) or bar.get('data-label') != point['label'] or bar.get('data-value') != point['value']:
            raise ValueError('chart_point_mismatch')
        rect = next((n for n in bar if local(n) == 'rect'), None)
        value = Decimal(point['value'])
        expected_height = float(abs(value) / span) * 320
        expected_y = 60 + float((high - max(value, Decimal(0))) / span) * 320
        if rect is None or abs(float(rect.get('height')) - expected_height) > .002 or abs(float(rect.get('y')) - expected_y) > .002 or float(rect.get('width')) <= 0:
            raise ValueError('chart_geometry_mismatch')
        if [n.text for n in row] != [point['label'], point['value']]:
            raise ValueError('chart_table_mismatch')
    return True
