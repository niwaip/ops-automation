"""A bounded evidence check for executable deployment snippets, not a fact verifier."""
import re

from .retrieval_policy import DEPLOYMENT_RE

FENCE = re.compile(r'```([^\n`]*)\n(.*?)```', re.S)
COMMAND = re.compile(r'^\s*(?:\$\s*|sudo\s+)?(?:docker(?:-compose)?|helm|kubectl|npm|npx|pip3?|uv|apt(?:-get)?|yum|dnf|brew|curl|wget|git)\s+', re.I)
NOTE = '（此处部署命令或配置尚未在本轮资料中核实，已省略；请按对应版本的官方部署文档操作。）'


def _normalize(text: str) -> str:
    return re.sub(r'\s+', ' ', text.replace('\\\n', ' ')).strip().casefold()


def unsupported_blocks(text: str, evidence) -> list[str]:
    sources = '\n'.join(item.render_text() for item in evidence if item.is_success
        and (item.provenance or {}).get('tool') in {'web_search', 'fetch_page', 'scan_knowledge', 'read_file'})
    normalized = _normalize(sources)
    unsupported = []
    for match in FENCE.finditer(text):
        body = match[2]
        if re.search(r'伪代码|不可直接执行|pseudocode', text[max(0, match.start() - 80):match.start()], re.I):
            continue
        commands = [re.sub(r'^\s*\$\s*', '', line).strip() for line in body.replace('\\\n', ' ').splitlines()
                    if COMMAND.match(line)]
        yaml_config = bool(re.search(r'^\s*(?:apiVersion|kind):', body, re.M))
        config_lines = [line.strip() for line in body.splitlines()
                        if line.strip() and not line.lstrip().startswith('#')] if yaml_config else []
        if any(_normalize(line) not in normalized for line in commands + config_lines):
            unsupported.append(match[0])
    return unsupported


class DeploymentEvidenceReview:
    """At most one correction cycle; never let a repair create an unbounded loop."""
    def __init__(self, prompt: str, tools):
        names = {t.get('function', {}).get('name', t.get('name', '')) for t in tools}
        self.enabled = bool(DEPLOYMENT_RE.search(prompt) and 'web_search' in names)
        self.requested = False

    def review(self, text, evidence, *, can_retry: bool, telemetry):
        if not self.enabled:
            return '', text
        from .retrieval_citations import assess_citations, omit_unsupported_citations
        text, unknown = assess_citations(text, evidence)
        missing = unsupported_blocks(text, evidence)
        if not missing and not unknown:
            return '', text
        telemetry.record_guard('deployment_evidence', 'needs_verification' if can_retry and not self.requested else 'omitted',
                               {'unsupportedBlocks': len(missing), 'unsupportedCitations': len(unknown),
                                'retryUsed': self.requested})
        if can_retry and not self.requested:
            self.requested = True
            return ('【部署资料核验】草稿中有命令、配置或来源链接未出现在本轮成功读取的资料中。'
                    '请 web_search 定向查询对应产品和版本的官方 installation/quickstart，'
                    '再 fetch_page 读取安装配置正文；已有个人原件可 read_file 继续核对。'
                    '只保留有来源支持的条目和可执行命令；个人资料直接引用原件界面链接，不编造官网地址。'
                    '若查询仍无法核实，省略相应内容并明确缺口。不要重复泛搜新闻。', text)
        for block in missing:
            text = text.replace(block, NOTE)
        if unknown:
            text = omit_unsupported_citations(text, unknown)
            text += '\n\n部分条目因缺少本轮可追溯的来源，未列入以上结果。'
        return '', text
