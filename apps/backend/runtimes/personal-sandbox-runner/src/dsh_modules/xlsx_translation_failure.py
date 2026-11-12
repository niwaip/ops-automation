"""Explain bounded XLSX execution failures and the supported recovery action."""
import json
import socket
import urllib.error


FORMAT_FAILURE_MARKERS = (
    'Translation keys do not cover the batch',
    'Truncated model output',
    'Empty or invalid translation value',
    'Translation changed a source URL',
    'Incomplete translation batch',
)


def _has_format_failure(chain):
    for item in chain:
        if isinstance(item, json.JSONDecodeError):
            return True
        if any(marker in str(item) for marker in FORMAT_FAILURE_MARKERS):
            return True
    return False


def exception_chain(error):
    chain, seen = [], set()
    while error is not None and id(error) not in seen and len(chain) < 10:
        seen.add(id(error))
        chain.append(error)
        error = error.__cause__ or error.__context__
    return chain


def failure_feedback(error, manifest=None):
    manifest = manifest or getattr(error, 'xlsx_manifest', {})
    chain = exception_chain(error)
    stage = manifest.get('active_stage')
    progress = manifest.get('progress', {})
    code, reason = 'execution_failed', '处理过程发生错误，本轮未生成可交付文件。'
    retryable = False
    detail_code = None
    if any(isinstance(item, FileNotFoundError) for item in chain):
        code, reason = 'input_missing', '未找到本轮输入文件，本轮未生成可交付文件。'
        action = '请在本会话重新上传原件，再执行翻译。'
    elif any(isinstance(item, urllib.error.HTTPError) and item.code in (401, 403) for item in chain):
        code, reason = 'model_auth_failed', '模型服务的身份或权限校验失败，本轮未完成翻译。'
        action = '请检查模型服务的凭据或权限，修复后在本会话回复“继续”。'
    elif any(isinstance(item, (TimeoutError, socket.timeout)) for item in chain):
        code, reason, retryable = 'model_timeout', '翻译请求等待超时，有限重试后仍未完成，本轮已停止。', True
    elif any(isinstance(item, urllib.error.HTTPError) and (item.code >= 500 or item.code == 429) for item in chain):
        status = next(item.code for item in reversed(chain)
                      if isinstance(item, urllib.error.HTTPError) and (item.code >= 500 or item.code == 429))
        code, reason, retryable = 'model_unavailable', f'模型服务返回 HTTP {status}，有限重试后仍未恢复，本轮翻译已停止。', True
    elif any(isinstance(item, urllib.error.URLError) or type(item).__name__ == 'TranslationStreamError'
             for item in chain):
        code, reason, retryable = 'model_stream_failed', '模型服务连接或输出流中断，有限重试后仍未恢复，本轮翻译已停止。', True
    elif stage == 'validate':
        code, reason = 'integrity_check_failed', '工作簿完整性校验未通过，本轮文件未发布。'
        action = '请在本会话回复“查看失败原因”，定位并修复校验问题后再继续。'
    elif stage == 'translate':
        if _has_format_failure(chain):
            code, detail_code, retryable = 'translation_incomplete', 'format_invalid', True
            reason = '部分译文输出格式异常，有限重试后仍未恢复，本轮文件未发布。'
        else:
            code, detail_code, retryable = 'translation_incomplete', 'acceptance_incomplete', True
            reason = '部分译文未满足完整性要求，本轮文件未发布。'
    else:
        action = '请在本会话回复“查看失败原因”，定位处理错误后再继续。'
    if retryable:
        scoped = manifest.get('session_id') and not manifest['session_id'].startswith('unscoped:')
        if code == 'translation_incomplete':
            action = ('请在本会话回复“继续”，复用已完成译文并重试未通过部分；无需重新上传。'
                      '若多次重试后仍有条目未通过，请切换其他可用模型后再继续。' if scoped
                      else '请调整或切换可用模型后重新执行本任务。')
        else:
            action = ('请在本会话回复“继续”，复用已完成译文并重试未完成部分；无需重新上传。'
                      '若再次遇到模型服务故障，请检查服务或切换可用模型后再继续。' if scoped
                      else '请确认模型服务可用后重新执行本任务。')
    status = ''
    if progress:
        status = (f"已保留 {progress['completed']}/{progress['total']} 条有效译文，"
                  f"剩余 {progress['remaining']} 条。")
    return dict(code=code, detail_code=detail_code, stage=stage, retryable=retryable, progress=progress,
                next_action=action, message=reason + status + action)
