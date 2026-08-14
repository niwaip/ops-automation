import traceback
import re
from typing import Any, Dict

from temporalio import activity


_SENSITIVE_KEY = re.compile(
    r'api[-_]?key|token|secret|password|authorization|cookie',
    re.IGNORECASE,
)


def _redact_sensitive_values(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: '[REDACTED]' if _SENSITIVE_KEY.search(str(key)) else _redact_sensitive_values(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive_values(item) for item in value]
    return value


@activity.defn
async def execute_code_activity(
    code: str,
    fn_name: str,
    activity_id: str,
    input_data: Dict[str, Any],
    validation_attempt: int = 1,
) -> Dict[str, Any]:
    """
    Activity that executes Python code in an isolated sandbox.

    This is where the actual code execution happens. The code is fetched
    from the auth service before being passed here.
    """

    attempt = validation_attempt or activity.info().attempt
    activity.logger.info(f'Starting code execution for: {activity_id}, attempt={attempt}')
    activity.logger.info(f'Function: {fn_name}')
    activity.logger.info(f'Input: {_redact_sensitive_values(input_data)}')

    from sandbox_executor import execute_in_sandbox

    try:
        result = await execute_in_sandbox(code, fn_name, input_data, attempt=attempt)
        if result.get('success', result.get('error') is None):
            activity.logger.info('Execution completed successfully')
        else:
            activity.logger.error(f"Execution returned error result: {result.get('error')}")
        result['attempt'] = attempt
        return result
    except Exception as exc:
        error_traceback = traceback.format_exc()
        activity.logger.error(f'Execution failed: {exc}\n{error_traceback}')
        return {
            'error': str(exc),
            'error_type': type(exc).__name__,
            'traceback': error_traceback,
            'result': None,
            'success': False,
            'attempt': attempt,
        }
