"""Typed model termination reasons, without untrusted upstream error text."""
import hashlib


class ModelStreamError(RuntimeError):
    def __init__(self, code, details=None):
        super().__init__(code)
        self.code = code
        self.details = details or {}


class ModelRepetitionLoopError(ModelStreamError):
    def __init__(self, message='', pattern='', repeat_count=0, target='thought', details=None):
        info = details or {'patternLength': len(pattern), 'repeatCount': repeat_count,
                           'target': target, 'patternSha256': hashlib.sha256(pattern.encode()).hexdigest()}
        super().__init__('MODEL_REPETITION', info)
        self.pattern = pattern
        self.pattern_len = info.get('patternLength', 0)
        self.repeat_count = info.get('repeatCount', 0)
        self.target = info.get('target', 'content')
        self.message = message

    def __str__(self):
        return self.message or self.code


def model_failure_text(code, details=None):
    if code == 'MODEL_REPETITION':
        return ('⚠️ **模型推理陷入死循环，已触发主动熔断保护**\n\n'
                '检测到模型重复输出，已中止本次请求。请直接重新发送指令，或稍后点击重试。')
    if code == 'MODEL_GENERATION_BUDGET':
        return '模型生成已达到本阶段时间上限，本次请求已中止。请重试或更换模型。'
    if code == 'MODEL_STREAM_LIMIT':
        return '模型输出超过本阶段安全容量，本次请求已中止。请缩小查询范围后重试。'
    return '模型请求未完成，本次执行已中止。请稍后重试。'


def failure_code(error):
    if isinstance(error, ModelStreamError):
        return error.code
    if isinstance(error, TimeoutError):
        return 'MODEL_REQUEST_TIMEOUT'
    return 'MODEL_REQUEST_FAILED'
