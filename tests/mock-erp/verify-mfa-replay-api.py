import json
import os
import time
import urllib.request
import urllib.error
import uuid

BASE_TEMPLATE = 'http://localhost:3005'
BASE_SESSION = 'http://localhost:3002'
MOCK_ERP_HOST = os.environ.get('HOST_IP', '127.0.0.1')
MOCK_ERP_BASE = os.environ.get('MOCK_ERP_BASE', f'http://{MOCK_ERP_HOST}')


def request(method, url, data=None):
    body = None if data is None else json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {exc.code} {url}: {error_body}') from exc


def create_template():
    payload = {
        'name': f'mfa-replay-e2e-{int(time.time())}',
        'version': '1.0.0',
        'description': 'MFA replay verification template',
        'created_by': str(uuid.uuid4()),
        'params_schema': {
            'type': 'object',
            'properties': {
                'startUrl': {'type': 'string'},
            },
            'required': ['startUrl'],
        },
        'steps': [
            {
                'step_id': 'step_1',
                'action': 'navigate',
                'params': {'url': '${startUrl}'},
                'description': '打开登录页',
            },
            {
                'step_id': 'step_2',
                'action': 'read_value',
                'locator': {'type': 'css', 'value': 'body'},
                'params': {
                    'selector': 'body',
                    'method': 'attribute',
                    'attribute': 'data-auth-stage',
                    'max_length': 128,
                },
                'output_var': 'authStageBeforeLogin',
                'description': '读取登录前认证阶段',
            },
            {
                'step_id': 'step_3',
                'action': 'read_value',
                'locator': {'type': 'css', 'value': 'body'},
                'params': {'selector': 'body', 'method': 'innerText', 'max_length': 12000},
                'output_var': 'authPageTextBeforeLogin',
                'description': '检查登录前是否出现 MFA 认证提示',
            },
            {
                'step_id': 'step_4',
                'action': 'branch',
                'branch': {
                    'condition_fn': '(ctx) => { const stage = String(ctx.authStageBeforeLogin || "").trim().toLowerCase(); if (stage) { return stage !== "mfa"; } return !/(mfa|多要素認証|verification code|認証コード)/i.test(String(ctx.authPageTextBeforeLogin || "")); }',
                    'on_match': 'continue',
                    'on_mismatch': 'takeover',
                    'takeover_reason': '检测到页面已进入MFA认证，请人工完成认证后继续执行',
                    'description': '如果页面一开始就出现MFA认证提示，则暂停自动执行并等待人工完成认证',
                },
                'description': '如果页面一开始就出现MFA认证提示，则暂停自动执行并等待人工完成认证',
            },
            {
                'step_id': 'step_5',
                'action': 'fill',
                'locator': {'type': 'css', 'value': '#login-username'},
                'params': {'value': 'admin'},
                'description': '填写用户名',
            },
            {
                'step_id': 'step_6',
                'action': 'fill',
                'locator': {'type': 'css', 'value': '#login-password'},
                'params': {'value': 'admin'},
                'description': '填写密码',
            },
            {
                'step_id': 'step_7',
                'action': 'click',
                'locator': {'type': 'css', 'value': '#btn-submit-login'},
                'description': '点击登录',
            },
            {
                'step_id': 'step_8',
                'action': 'read_value',
                'locator': {'type': 'css', 'value': 'body'},
                'params': {
                    'selector': 'body',
                    'method': 'attribute',
                    'attribute': 'data-auth-stage',
                    'max_length': 128,
                },
                'output_var': 'authStageAfterLogin',
                'description': '读取登录后认证阶段',
            },
            {
                'step_id': 'step_9',
                'action': 'read_value',
                'locator': {'type': 'css', 'value': 'body'},
                'params': {'selector': 'body', 'method': 'innerText', 'max_length': 12000},
                'output_var': 'authPageTextAfterLogin',
                'description': '检查登录后是否出现 MFA 认证提示',
            },
            {
                'step_id': 'step_10',
                'action': 'branch',
                'branch': {
                    'condition_fn': '(ctx) => { const stage = String(ctx.authStageAfterLogin || "").trim().toLowerCase(); if (stage) { return stage !== "mfa"; } return !/(mfa|多要素認証|verification code|認証コード)/i.test(String(ctx.authPageTextAfterLogin || "")); }',
                    'on_match': 'continue',
                    'on_mismatch': 'takeover',
                    'takeover_reason': '检测到MFA认证提示，请人工完成认证后继续执行',
                    'description': '如果页面出现MFA认证提示，则暂停自动执行并等待人工完成认证',
                },
                'description': '如果页面出现MFA认证提示，则暂停自动执行并等待人工完成认证',
            },
        ],
    }
    _, template = request('POST', f'{BASE_TEMPLATE}/templates', payload)
    return template


def run_case(template_id, label, start_url):
    _, created = request(
        'POST',
        f'{BASE_SESSION}/sessions',
        {
            'user_id': str(uuid.uuid4()),
            'template_id': template_id,
            'params': {'startUrl': start_url},
        },
    )
    session_id = created['session']['id']
    start_status, _ = request(
        'POST',
        f'{BASE_SESSION}/sessions/{session_id}/start',
        {
            'template_id': template_id,
            'params': {'startUrl': start_url},
        },
    )
    _, session_detail = request('GET', f'{BASE_SESSION}/sessions/{session_id}')
    _, steps = request('GET', f'{BASE_SESSION}/sessions/{session_id}/steps')

    blocked_step = None
    for step in steps:
        if not step.get('success'):
            blocked_step = step
            break

    return {
        'case': label,
        'sessionId': session_id,
        'startStatus': start_status,
        'state': session_detail.get('state'),
        'control_mode': session_detail.get('control_mode'),
        'blocking_mode': session_detail.get('blocking_mode'),
        'blocking_reason': session_detail.get('blocking_reason'),
        'current_step': session_detail.get('current_step'),
        'failedStep': blocked_step,
        'stepCount': len(steps),
    }


def main():
    template = create_template()
    results = {
        'templateId': template['id'],
        'templateName': template['name'],
        'force_mfa': run_case(
            template['id'],
            'force_mfa',
            f'{MOCK_ERP_BASE}/?force_mfa=true',
        ),
        'skip_mfa': run_case(
            template['id'],
            'skip_mfa',
            f'{MOCK_ERP_BASE}/?skip_mfa=true',
        ),
    }
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
