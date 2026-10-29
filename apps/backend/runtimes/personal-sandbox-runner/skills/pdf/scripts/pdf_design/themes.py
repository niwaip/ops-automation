"""Print design tokens and installed font resolution, independent of renderer code."""

from pathlib import Path
import re
import subprocess


PALETTES = {
    'blue': ('#24547a', '#edf4f8'),
    'emerald': ('#28695c', '#eff6f1'),
    'slate': ('#475569', '#f1f3f5'),
    'burgundy': ('#853e53', '#faf0f2'),
    'warm': ('#995638', '#faf2e8'),
}
LAYOUTS = {
    'report': dict(page='A4', margin='22mm 20mm 21mm', body='10.5pt', leading='1.7',
                   heading='22pt', paper='#ffffff', serif=False),
    'handout': dict(page='A4', margin='19mm 18mm 20mm', body='11.5pt', leading='1.5',
                    heading='26pt', paper='#ffffff', serif=False),
    'editorial': dict(page='A4', margin='23mm 22mm 22mm', body='11pt', leading='1.8',
                      heading='28pt', paper='#fffefa', serif=True),
    'mobile': dict(page='108mm 192mm', margin='12mm 10mm 15mm', body='11.5pt', leading='1.65',
                   heading='22pt', paper='#ffffff', serif=False),
}


def font_match(family, style='Regular'):
    result = subprocess.run(['fc-match', '-f', '%{file}\n%{family}\n', f'{family}:style={style}:lang=zh-cn'],
                            capture_output=True, text=True, check=True, timeout=5)
    values = result.stdout.strip().splitlines()
    if len(values) < 2 or family.lower() not in values[1].lower():
        raise RuntimeError(f'Required local Chinese font unavailable: {family} ({style})')
    if not Path(values[0]).is_file():
        raise RuntimeError(f'Font file not found: {values[0]}')
    return {'family': family, 'style': style, 'path': values[0]}


def design_tokens(template='report', theme=None, accent=None):
    if template not in LAYOUTS:
        raise ValueError(f'Unknown PDF template: {template}')
    theme = theme or ('warm' if template in ('handout', 'editorial') else 'blue')
    if theme not in PALETTES:
        raise ValueError(f'Unknown PDF theme: {theme}')
    color, tint = PALETTES[theme]
    if accent:
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', accent):
            raise ValueError('Accent must be a six-digit #RRGGBB color')
        color = accent
        rgb = [int(accent[i:i + 2], 16) for i in (1, 3, 5)]
        tint = '#' + ''.join(f'{round(v * .07 + 255 * .93):02x}' for v in rgb)
    values = dict(LAYOUTS[template], accent=color, tint=tint, template=template, theme=theme)
    values['body_font'] = 'Noto Serif CJK SC' if values['serif'] else 'Noto Sans CJK SC'
    values['heading_font'] = 'Noto Sans CJK SC'
    return values


def installed_fonts(tokens):
    fonts = [font_match(family, style)
             for family in sorted({tokens['body_font'], tokens['heading_font']})
             for style in ('Regular', 'Bold')]
    # A regular face registered under a bold alias is not a substitute for a real bold face.
    for family in {item['family'] for item in fonts}:
        matches = [item for item in fonts if item['family'] == family]
        if matches[0]['path'] == matches[1]['path']:
            raise RuntimeError(f'Missing distinct Regular/Bold font files for {family}')
    return fonts
