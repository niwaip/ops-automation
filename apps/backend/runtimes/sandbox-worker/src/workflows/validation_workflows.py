import math
from datetime import timedelta
from typing import Any, Dict, List, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

from .activities import execute_code_activity
from .shared import parse_timeout_seconds


@workflow.defn
class ActivityValidationWorkflow:
    """Dedicated workflow for validating Activity code with retry semantics."""

    @workflow.run
    async def run(self, request: Dict[str, Any]) -> Dict[str, Any]:
        code = request.get('code', '')
        fn_name = request.get('fn_name', '')
        activity_id = request.get('activity_id', 'activity-validation')
        input_data = request.get('input_data', {}) or {}
        retry_policy = request.get('retry_policy', {}) or {}
        timeout_seconds = parse_timeout_seconds(request.get('timeout'))

        max_retries = max(int(retry_policy.get('maxRetries', 0) or 0), 0)
        max_attempts = max_retries + 1
        base_backoff_ms = max(int(retry_policy.get('backoffMs', 1000) or 1000), 0)
        all_logs: List[str] = [
            f'[ValidationWorker] 开始验证 Activity: {activity_id}',
            f'[ValidationWorker] 函数: {fn_name}',
            f'[ValidationWorker] 最大尝试次数: {max_attempts}',
            f'[ValidationWorker] 单次执行超时: {timeout_seconds}s',
        ]

        last_error: Optional[str] = None
        last_traceback: Optional[str] = None

        for attempt in range(1, max_attempts + 1):
            all_logs.append(f'[ValidationWorker] 第 {attempt}/{max_attempts} 次执行开始')

            try:
                execution_result = await workflow.execute_activity(
                    execute_code_activity,
                    args=[
                        code,
                        fn_name,
                        f'{activity_id}-attempt-{attempt}',
                        input_data,
                        attempt,
                    ],
                    start_to_close_timeout=timedelta(seconds=timeout_seconds),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except Exception as exc:
                last_error = str(exc)
                all_logs.append(f'[ValidationWorker] 第 {attempt}/{max_attempts} 次执行异常: {last_error}')
                if attempt >= max_attempts:
                    return {
                        'success': False,
                        'error': last_error,
                        'traceback': last_traceback,
                        'logs': all_logs,
                        'attempts': attempt,
                        'max_attempts': max_attempts,
                        'retry_policy': retry_policy,
                    }
            else:
                attempt_logs = execution_result.get('logs', []) or []
                all_logs.extend([f'[Attempt {attempt}] {log}' for log in attempt_logs])

                if execution_result.get('success', execution_result.get('error') is None):
                    all_logs.append(f'[ValidationWorker] 第 {attempt}/{max_attempts} 次执行成功')
                    return {
                        'success': True,
                        'result': execution_result.get('result'),
                        'logs': all_logs,
                        'attempts': attempt,
                        'max_attempts': max_attempts,
                        'retry_policy': retry_policy,
                    }

                last_error = execution_result.get('error') or 'Unknown error'
                last_traceback = execution_result.get('traceback')
                non_retryable = bool(execution_result.get('non_retryable'))
                all_logs.append(f'[ValidationWorker] 第 {attempt}/{max_attempts} 次执行失败: {last_error}')

                if non_retryable:
                    all_logs.append('[ValidationWorker] 检测到 non_retryable=True，停止后续重试')
                    return {
                        'success': False,
                        'error': last_error,
                        'traceback': last_traceback,
                        'logs': all_logs,
                        'attempts': attempt,
                        'max_attempts': max_attempts,
                        'retry_policy': retry_policy,
                        'non_retryable': True,
                    }

                if attempt >= max_attempts:
                    return {
                        'success': False,
                        'error': last_error,
                        'traceback': last_traceback,
                        'logs': all_logs,
                        'attempts': attempt,
                        'max_attempts': max_attempts,
                        'retry_policy': retry_policy,
                    }

            wait_ms = min(base_backoff_ms * int(math.pow(2, attempt - 1)), 30000)
            if wait_ms > 0:
                all_logs.append(f'[ValidationWorker] 等待 {wait_ms}ms 后进入下一次重试')
                await workflow.sleep(timedelta(milliseconds=wait_ms))

        return {
            'success': False,
            'error': last_error or 'Validation failed',
            'traceback': last_traceback,
            'logs': all_logs,
            'attempts': max_attempts,
            'max_attempts': max_attempts,
            'retry_policy': retry_policy,
        }


@workflow.defn
class WorkflowValidationWorkflow:
    """Dedicated workflow for validating Workflow code in the test worker."""

    @workflow.run
    async def run(self, request: Dict[str, Any]) -> Dict[str, Any]:
        code = request.get('code', '')
        fn_name = request.get('fn_name', '')
        workflow_id = request.get('workflow_id', 'workflow-validation')
        input_data = request.get('input_data', {}) or {}
        timeout_seconds = parse_timeout_seconds(request.get('timeout'))
        task_queue = request.get('task_queue') or 'SKILL_TASK_QUEUE'
        all_logs: List[str] = [
            f'[ValidationWorker] 开始真实验证 Workflow: {workflow_id}',
            f'[ValidationWorker] Workflow 类: {fn_name}',
            f'[ValidationWorker] 目标 Task Queue: {task_queue}',
            f'[ValidationWorker] 单次执行超时: {timeout_seconds}s',
        ]

        try:
            execution_result = await workflow.execute_activity(
                execute_code_activity,
                args=[
                    code,
                    fn_name,
                    workflow_id,
                    input_data,
                    1,
                ],
                start_to_close_timeout=timedelta(seconds=timeout_seconds),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except Exception as exc:
            error_msg = str(exc)
            all_logs.append(f'[ValidationWorker] Workflow 执行异常: {error_msg}')
            return {
                'success': False,
                'error': error_msg,
                'logs': all_logs,
            }

        attempt_logs = execution_result.get('logs', []) or []
        all_logs.extend([f'[Workflow Attempt] {log}' for log in attempt_logs])

        if execution_result.get('success', execution_result.get('error') is None):
            all_logs.append('[ValidationWorker] Workflow 真实验证成功')
            return {
                'success': True,
                'result': execution_result.get('result'),
                'logs': all_logs,
            }

        error_msg = execution_result.get('error') or 'Workflow validation failed'
        all_logs.append(f'[ValidationWorker] Workflow 真实验证失败: {error_msg}')
        return {
            'success': False,
            'error': error_msg,
            'traceback': execution_result.get('traceback'),
            'logs': all_logs,
            'non_retryable': bool(execution_result.get('non_retryable')),
        }
