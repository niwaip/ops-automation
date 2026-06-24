import asyncio
import json
import os
import re
import tempfile
from typing import Any, Dict, List

import certifi

from .runner_template import RUNNER_TEMPLATE


def _clean_code(code: str) -> str:
    """Strip markdown fences from code."""
    if '```' not in code:
        return code
    match = re.search(r'```(?:python)?\n?(.*?)```', code, re.DOTALL)
    if match:
        return match.group(1).strip()
    clean = re.sub(r'```[a-zA-Z]*\n?', '', code)
    return clean.replace('```', '').strip()


def _build_runner_script(
    cert_path: str,
    input_file: str,
    activity_file: str,
    result_file: str,
    fn_name: str,
    attempt: int,
) -> str:
    """Fill placeholders in the runner template."""
    return (
        RUNNER_TEMPLATE.replace('CERT_FILE_PATH', cert_path)
        .replace('INPUT_FILE', input_file)
        .replace('ACTIVITY_FILE', activity_file)
        .replace('RESULT_FILE', result_file)
        .replace('FN_NAME', fn_name)
        .replace('ATTEMPT_NUMBER', str(attempt))
    )


def _prepare_sandbox_files(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    attempt: int,
    temp_dir: str,
) -> str:
    """Create activity, input, and runner files inside *temp_dir*."""
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

    clean_code = _clean_code(code)

    activity_file = os.path.join(temp_dir, 'activity.py')
    input_file = os.path.join(temp_dir, 'input.json')
    runner_file = os.path.join(temp_dir, 'runner.py')
    result_file = os.path.join(temp_dir, 'result.json')

    with open(activity_file, 'w') as file:
        file.write(clean_code)

    with open(input_file, 'w') as file:
        json.dump(input_data, file)

    runner_script = _build_runner_script(
        cert_path=certifi.where(),
        input_file=input_file,
        activity_file=activity_file,
        result_file=result_file,
        fn_name=fn_name,
        attempt=attempt,
    )

    with open(runner_file, 'w') as file:
        file.write(runner_script)

    return runner_file


def _parse_result(
    result_file: str,
    execution_logs: List[str],
    missing_traceback: str = '',
) -> Dict[str, Any]:
    """Read and parse the result JSON file."""
    try:
        if os.path.exists(result_file):
            with open(result_file, 'r') as file:
                result = json.load(file)
            return {
                'result': result.get('result'),
                'error': result.get('error'),
                'traceback': result.get('traceback'),
                'logs': execution_logs,
                'success': result.get('success', result.get('error') is None),
                'error_type': result.get('error_type'),
                'non_retryable': result.get('non_retryable', False),
            }
        return {
            'result': None,
            'error': 'Sandbox failed to write result file',
            'traceback': missing_traceback,
            'logs': execution_logs,
            'success': False,
        }
    except Exception as exc:
        return {
            'result': None,
            'error': f'Result parsing error: {str(exc)}',
            'logs': execution_logs,
            'success': False,
        }


async def execute_in_sandbox(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    attempt: int = 1,
) -> Dict[str, Any]:
    """Execute Python code in an isolated sandbox environment."""
    with tempfile.TemporaryDirectory() as temp_dir:
        runner_file = _prepare_sandbox_files(code, fn_name, input_data, attempt, temp_dir)
        result_file = os.path.join(temp_dir, 'result.json')

        proc = await asyncio.create_subprocess_exec(
            'python3',
            runner_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await proc.communicate()
        stdout_str = stdout.decode('utf-8') if stdout else ''
        stderr_str = stderr.decode('utf-8') if stderr else ''

        execution_logs: List[str] = []
        if stderr_str:
            for line in stderr_str.strip().split('\n'):
                if line:
                    execution_logs.append(f'[Python stderr] {line}')
        if stdout_str.strip():
            for line in stdout_str.strip().split('\n'):
                if line:
                    execution_logs.append(f'[Activity stdout] {line}')

        return _parse_result(
            result_file,
            execution_logs,
            missing_traceback=f'Stdout: {stdout_str}\nStderr: {stderr_str}',
        )


async def execute_in_sandbox_streaming(
    code: str,
    fn_name: str,
    input_data: Dict[str, Any],
    on_log,
    attempt: int = 1,
) -> Dict[str, Any]:
    """Execute Python code in sandbox and stream stdout/stderr logs incrementally."""
    with tempfile.TemporaryDirectory() as temp_dir:
        runner_file = _prepare_sandbox_files(code, fn_name, input_data, attempt, temp_dir)
        result_file = os.path.join(temp_dir, 'result.json')

        proc = await asyncio.create_subprocess_exec(
            'python3',
            runner_file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        execution_logs: List[str] = []

        async def forward_stream(stream, prefix: str):
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode('utf-8', errors='replace').rstrip('\n')
                if not decoded:
                    continue
                log_line = f'{prefix} {decoded}'
                execution_logs.append(log_line)
                await on_log(log_line)

        await asyncio.gather(
            forward_stream(proc.stdout, '[Activity stdout]'),
            forward_stream(proc.stderr, '[Python stderr]'),
        )
        await proc.wait()

        return _parse_result(
            result_file,
            execution_logs,
            missing_traceback='Result file not found',
        )
