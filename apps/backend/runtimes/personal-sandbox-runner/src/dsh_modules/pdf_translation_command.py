"""One CLI grammar for the installed entry point and its shell budget bridge."""
import argparse
from pathlib import Path
import re
import shlex


class CommandError(ValueError):
    code = 'invalid_arguments'


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise CommandError(message)


def build_parser():
    parser = Parser(prog='flow_pdf_translate.py')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('auto', 'unpack', 'pack'):
        command = commands.add_parser(name)
        command.add_argument('work_dir' if name == 'pack' else 'input_pdf')
        command.add_argument('work_dir' if name == 'unpack' else 'output_pdf')
        command.add_argument('--lang', default='zh-CN')
        command.add_argument('--layout', choices=['balanced', 'preserve', 'reading'], default='balanced')
        if name == 'auto':
            command.add_argument('--temp-dir', help='Deprecated; isolated job directories are used')
            command.add_argument('--resume', help='Resume a validated source/translation checkpoint directory')
    return parser


def parse_installed_command(cmd, workspace, installed):
    lexer = shlex.shlex(re.sub(r'\\\r?\n', '', cmd), posix=True, punctuation_chars=';&|<>()')
    lexer.whitespace_split = True
    try:
        tokens = list(lexer)
    except ValueError:
        return None
    root = Path(workspace).resolve()
    if len(tokens) > 3 and tokens[:1] == ['cd'] and tokens[2] == '&&':
        if (root / tokens[1]).resolve() != root:
            return None
        tokens = tokens[3:]
    if len(tokens) > 2 and tokens[0] == 'timeout' and re.fullmatch(r'\d+(?:\.\d+)?s?', tokens[1]):
        tokens = tokens[2:]
    # Permit only a bounded, read-only output tail; the shell still uses pipefail.
    # This common diagnostic wrapper must not bypass job budgets or accounting.
    if '|' in tokens:
        split = tokens.index('|')
        tail = tokens[split + 1:]
        if not (len(tail) == 2 and tail[0] == 'tail' and re.fullmatch(r'-[1-9]\d{0,3}', tail[1])
                or len(tail) == 3 and tail[:2] == ['tail', '-n'] and re.fullmatch(r'[1-9]\d{0,3}', tail[2])):
            return None
        tokens = tokens[:split]
    if tokens[-3:] == ['2', '>&', '1']:
        tokens = tokens[:-3]
    if len(tokens) < 3 or Path(tokens[0]).name not in ('python', 'python3'):
        return None
    if any('$' in token or '`' in token or '\x00' in token for token in tokens):
        return None
    if any(re.fullmatch(r'[;&|<>()]+', t) for t in tokens):
        return None
    if (root / tokens[1]).resolve() != Path(installed).resolve() or not Path(installed).is_file():
        return None
    try:
        return build_parser().parse_args(tokens[2:])
    except (CommandError, SystemExit):
        return None


def invokes_installed_cli(cmd, workspace, installed):
    """Identify even unsupported wrappers so they cannot silently run standalone."""
    try:
        lexer = shlex.shlex(re.sub(r'\\\r?\n', '', cmd), posix=True, punctuation_chars=';&|<>()')
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return False
    root = Path(workspace).resolve()
    return any(Path(left).name in ('python', 'python3')
               and (root / right).resolve() == Path(installed).resolve()
               for left, right in zip(tokens, tokens[1:]))
