"""Source attribution exclusively from successful MCP evidence in the current turn."""
import re
from .mcp_runtime import safe_source_url


def finalize_mcp_sources(text, evidence, selected=False, prompt="", stop_reason=None, skill_id=None, telemetry=None):
    if stop_reason:
        from .model_failures import model_failure_text
        return model_failure_text(stop_reason) + ('\n\n本轮未完成 MCP 结果核验，无法提供已核实的答案。' if selected else '')
    successful = [e for e in evidence if getattr(e, 'is_success', False)
                  and (getattr(e, 'provenance', None) or {}).get('tool') == 'call_external_tool']
    if selected and any((getattr(e, 'provenance', None) or {}).get('mcp_status') == 'awaiting_confirmation' for e in evidence):
        return '该外部操作尚未执行，请到设置 → 外部工具连接核对待确认参数并确认。'
    if selected and not successful:
        failures = [e for e in evidence if getattr(e, 'is_error', False)
                    and (getattr(e, 'provenance', None) or {}).get('tool') in {'call_external_tool', 'list_external_tools'}]
        if failures:
            code = failures[-1].error_code
            reason = {'MCP_ARGUMENTS_INVALID': '外部工具参数不符合已披露契约。',
                      'MCP_ARGUMENTS_UNGROUNDED': '所需坐标尚未通过本轮来源核验。',
                      'MCP_CONTRACT_REQUIRED': '尚未完成单工具契约披露。',
                      'MCP_AUTH_REQUIRED': '本人外部工具授权未通过。',
                      'MCP_ACCESS_DENIED': '外部工具权限校验未通过。',
                      'MCP_TOOL_UNAVAILABLE': '所选外部工具当前不可用。',
                      'MCP_CONTRACT_STALE': '工具契约已变化，需要重新披露。',
                      'MCP_RATE_LIMITED': '外部工具网关正在限流。',
                      'MCP_TRANSPORT_UNCONFIRMED': '与工具网关的通信未完成。'}.get(code, '工具执行未确认成功。')
            return reason + '本次未取得成功的 MCP 调用结果，无法提供已核实的答案；结果不明的写入请先核对，勿重复执行。'
        return '本次未取得成功的 MCP 调用结果，无法据此提供已核实的答案。请重试或查看本次执行记录。'
    if not successful:
        return None
    if selected and skill_id:
        from .mcp_objective import missing_objective
        target = missing_objective(prompt, evidence, skill_id)
        if target:
            if telemetry:
                telemetry.record_guard('mcp_objective', 'incomplete', {'skill_id': skill_id, 'tool_name': target['name']})
            return '本轮已取得部分辅助查询结果，但尚未取得目标工具 ' + str(target['name'])[:128] + ' 的成功结果，无法提供已核实的完整方案。请补充必要信息或重试。'
        if telemetry:
            telemetry.record_guard('mcp_objective', 'checked', {'skill_id': skill_id})
    # Replace only the standardized sources footer; never reuse ambient workspace scan matches.
    text = re.split(r'\n(?:---\s*\n)?###\s*📚\s*资料与引用来源', text, maxsplit=1)[0].rstrip()
    sources = []
    seen = set()
    for item in successful:
        for source in (item.provenance or {}).get('sources', []):
            url = safe_source_url(source.get('url'))
            key = url.split('#')[0] if url else None
            if not key or key in seen:
                continue
            seen.add(key)
            title = re.sub(r'[\r\n\[\]<>]', ' ', str(source.get('title') or url)).strip()[:240]
            url = url.replace('(', '%28').replace(')', '%29')
            sources.append(f'- [{title}]({url})')
    if not sources:
        return text
    from .mcp_review_sources import canonical_url
    cited_urls = {canonical_url(url) for url in re.findall(r'\]\((https?://[^\s)]+)\)', text)}
    cited = [source for source in sources if canonical_url(source.split('](', 1)[-1].rstrip(')')) in cited_urls]
    if cited:
        sources = cited
    # Do not turn remembered application/tenant identifiers into sourced configuration facts.
    import json
    basis = prompt + '\n' + '\n'.join(json.dumps(e.data, ensure_ascii=False, default=str) for e in successful)
    unsupported = {m for m in re.findall(r'\b[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\b', text) if m.lower() not in basis.lower()}
    for identifier in unsupported:
        text = text.replace(identifier, '[本轮来源未核实，已省略]')
    if unsupported:
        text += '\n\n部分具体标识未在本轮来源中核实，已隐藏；请按原文及实际环境确认。'
    return text + '\n\n---\n### 📚 本轮 MCP 检索来源\n\n' + '\n'.join(sources[:8]) + '\n\n以上为本轮成功检索返回的文档片段来源，不代表已阅读全文。'
