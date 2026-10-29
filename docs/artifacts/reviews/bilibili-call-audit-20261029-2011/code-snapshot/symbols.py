"""Font-independent inline symbols; rankings remain searchable numeric text."""
import base64
from html import escape
from html.parser import HTMLParser
import re

# Small local vector vocabulary, shared by headings, tables and metadata.
PATHS = {
    'fire': 'M12 2C14 8 20 8 20 15a8 8 0 0 1-16 0c0-4 3-7 5-9 0 4 2 5 3 6 2-3 2-6 0-10Z',
    'star': 'm12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z',
    'chart': 'M3 21V3h2v16h17v2ZM7 16v-5h3v5Zm5 0V7h3v9Zm5 0V3h3v13Z',
    'game': 'M6 6h12l4 13h-5l-3-4h-4l-3 4H2Zm1 3v2H5v2h2v2h2v-2h2v-2H9V9Zm9 1v3h3v-3Z',
    'video': 'M2 5h20v14H2Zm8 3v8l7-4Z',
    'pin': 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    'note': 'M4 2h12l4 4v16H4Zm3 6v2h10V8Zm0 5v2h10v-2Zm0 5v2h7v-2Z',
    'bolt': 'M13 1 3 14h7l-1 9L22 9h-8Z',
    'building': 'm12 2 11 5v2H1V7Zm-8 9h3v8H4Zm6 0h4v8h-4Zm7 0h3v8h-3ZM2 20h20v2H2Z',
    'science': 'M8 2h8v2h-2v5l7 11v2H3v-2l7-11V4H8Zm4 9-5 8h10Z',
    'leaf': 'M21 2C10 1 2 6 3 14c1 6 7 8 12 4 4-3 5-9 6-16ZM4 21 16 8l-9 14Z',
    'up': 'M2 17 9 10l4 4 6-7h-5V4h9v9h-3V9l-7 9-4-4-5 6Z',
    'minus': 'M3 10h18v4H3Z',
}
SYMBOLS = dict(zip('🔥🏆⭐📊🎮🎬📌📝⚡🏛🔬🌿✅📺📄',
                   ['fire','star','star','chart','game','video','pin','note','bolt','building','science','leaf','star','video','note']))
SYMBOLS.update({'📈': 'up', '➖': 'minus'})


def symbol_text(text):
    # A medal followed by NO.1 must not become "1 NO.1".
    for symbol, rank in [('🥇', '1'), ('🥈', '2'), ('🥉', '3')]:
        text = re.sub(re.escape(symbol) + r'\ufe0f?\s*(?:NO\.?\s*' + rank + r'\b)?', rank + ' ', text, flags=re.I)
    return text


def symbol_html(text):
    text = symbol_text(str(text))
    result = []
    for char in text:
        if char == '\ufe0f':
            continue
        kind = SYMBOLS.get(char)
        if kind:
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
                   f'<path fill="#087ca7" fill-rule="evenodd" d="{PATHS[kind]}"/></svg>')
            encoded = base64.b64encode(svg.encode()).decode()
            result.append(f'<img class="pdf-symbol" alt="" src="data:image/svg+xml;base64,{encoded}" '
                          'style="width:1em;height:1em;vertical-align:-0.12em;display:inline-block">')
        else:
            # Unknown pictographs must not silently disappear or become tofu.
            if 0x1F000 <= ord(char) <= 0x1FAFF or char == '\u200d':
                raise ValueError(f'Unsupported PDF symbol U+{ord(char):04X}; use a local SVG or a text label')
            result.append(escape(char))
    return ''.join(result)


class SymbolHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.code_depth = 0

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())
        if tag in ('pre', 'code'):
            self.code_depth += 1

    def handle_startendtag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.parts.append(f'</{tag}>')
        if tag in ('pre', 'code'):
            self.code_depth = max(0, self.code_depth - 1)

    def handle_data(self, data):
        self.parts.append(escape(data) if self.code_depth else symbol_html(data))

    def handle_entityref(self, name):
        from html import unescape
        value = unescape(f'&{name};')
        self.parts.append(escape(value) if self.code_depth else symbol_html(value))

    def handle_charref(self, name):
        self.handle_entityref('#' + name)

    def handle_comment(self, data):
        self.parts.append('<!--' + data + '-->')


def render_symbols(html):
    parser = SymbolHTML()
    parser.feed(html)
    return ''.join(parser.parts)
