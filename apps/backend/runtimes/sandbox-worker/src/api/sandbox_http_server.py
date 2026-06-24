import asyncio
import json
import logging
import uuid

from aiohttp import web
from temporalio.client import Client

from workflows import (
    ActivityValidationWorkflow,
    AgentSessionWorkflow,
    ExecutionSignalInput,
    WorkflowValidationWorkflow,
)

logger = logging.getLogger(__name__)


class TemporalSandboxServer:
    """HTTP server for triggering sandbox executions."""

    def __init__(self, client: Client, validation_task_queue: str):
        self.client = client
        self.validation_task_queue = validation_task_queue
        self._app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        self._app.router.add_post('/execute', self.handle_execute)
        self._app.router.add_post('/execute/stream', self.handle_execute_stream)
        self._app.router.add_post('/validate-activity', self.handle_validate_activity)
        self._app.router.add_post('/validate-workflow', self.handle_validate_workflow)
        self._app.router.add_post('/validate-workflow/stream', self.handle_validate_workflow_stream)
        self._app.router.add_get('/health', self.handle_health)

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({'status': 'healthy'})

    async def handle_execute(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)

        code = data.get('code')
        fn_name = data.get('fn_name')
        activity_id = data.get('activity_id') or str(uuid.uuid4())
        input_data = data.get('input_data', {})

        if not code or not fn_name:
            return web.json_response({'error': 'code and fn_name are required'}, status=400)

        session_id = activity_id
        workflow_id = f'agent-session-{session_id}'

        try:
            try:
                handle = self.client.get_workflow_handle(workflow_id)
                await handle.query(AgentSessionWorkflow.get_state)
                logger.info('Using existing workflow: %s', workflow_id)
            except Exception:
                logger.info('Starting new workflow: %s', workflow_id)
                handle = await self.client.start_workflow(
                    AgentSessionWorkflow.run,
                    session_id,
                    id=workflow_id,
                    task_queue='sandbox-agent-task-queue',
                )

            signal = ExecutionSignalInput(
                code=code,
                fn_name=fn_name,
                activity_id=activity_id,
                input_data=input_data,
            )

            logger.info('Signaling workflow %s to execute %s', workflow_id, activity_id)
            await handle.signal(AgentSessionWorkflow.execute_code, signal)

            result = None
            from datetime import datetime, timedelta, timezone

            start_time = datetime.now(timezone.utc)
            timeout = timedelta(minutes=5)

            while True:
                query_result = await handle.query(AgentSessionWorkflow.get_result)
                logger.info('Query result type: %s, value: %s', type(query_result), query_result)
                if query_result:
                    result = query_result
                    break

                elapsed = datetime.now(timezone.utc) - start_time
                if elapsed > timeout:
                    return web.json_response(
                        {
                            'error': f'Timeout waiting for result after {elapsed}',
                            'workflow_id': workflow_id,
                            'activity_id': activity_id,
                        },
                        status=504,
                    )

                await asyncio.sleep(0.5)

            try:
                json.dumps(result)
            except (TypeError, ValueError) as exc:
                logger.error('Result is not JSON serializable: %s, result=%s', exc, result)
                result = {'error': 'Result contains non-serializable data', 'raw': str(result)}

            return web.json_response(
                {
                    'success': True,
                    'result': result,
                    'workflow_id': workflow_id,
                    'activity_id': activity_id,
                }
            )
        except Exception as exc:
            import traceback

            logger.error('Execution failed: %s\n%s', exc, traceback.format_exc())
            return web.json_response({'error': str(exc)}, status=500)

    async def handle_validate_activity(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)

        code = data.get('code')
        fn_name = data.get('fn_name')
        activity_id = data.get('activity_id') or str(uuid.uuid4())

        if not code or not fn_name:
            return web.json_response({'error': 'code and fn_name are required'}, status=400)

        workflow_id = f'activity-validation-{activity_id}'
        validation_request = {
            'code': code,
            'fn_name': fn_name,
            'activity_id': activity_id,
            'input_data': data.get('input_data', {}),
            'retry_policy': data.get('retry_policy') or {},
            'timeout': data.get('timeout'),
            'task_queue': data.get('task_queue'),
        }

        try:
            logger.info(
                'Starting validation workflow %s on task queue %s',
                workflow_id,
                self.validation_task_queue,
            )
            handle = await self.client.start_workflow(
                ActivityValidationWorkflow.run,
                validation_request,
                id=workflow_id,
                task_queue=self.validation_task_queue,
            )
            result = await handle.result()
            return web.json_response(
                {
                    'success': True,
                    'result': result,
                    'workflow_id': workflow_id,
                    'activity_id': activity_id,
                }
            )
        except Exception as exc:
            import traceback

            logger.error('Activity validation failed: %s\n%s', exc, traceback.format_exc())
            return web.json_response({'error': str(exc)}, status=500)

    async def handle_execute_stream(self, request: web.Request) -> web.StreamResponse:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            response = web.StreamResponse(
                status=400,
                headers={
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            )
            await response.prepare(request)
            await response.write(
                f"data: {json.dumps({'type': 'error', 'content': 'Invalid JSON'}, ensure_ascii=False)}\n\n".encode(
                    'utf-8'
                )
            )
            await response.write_eof()
            return response

        code = data.get('code')
        fn_name = data.get('fn_name')
        activity_id = data.get('activity_id') or str(uuid.uuid4())
        input_data = data.get('input_data', {}) or {}
        workflow_id = f'agent-session-{activity_id}'

        response = web.StreamResponse(
            status=200,
            headers={
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        )
        await response.prepare(request)

        async def emit(event: dict):
            await response.write(f'data: {json.dumps(event, ensure_ascii=False)}\n\n'.encode('utf-8'))

        if not code or not fn_name:
            await emit({'type': 'error', 'content': 'code and fn_name are required'})
            await response.write_eof()
            return response

        async def emit_log(message: str):
            await emit({'type': 'log', 'content': message})

        try:
            await emit_log(f'[SandboxAgent] 开始执行: {workflow_id}')
            await emit_log(f'[SandboxAgent] 函数入口: {fn_name}')

            from sandbox_executor import execute_in_sandbox_streaming

            execution_result = await execute_in_sandbox_streaming(
                code,
                fn_name,
                input_data,
                emit_log,
                attempt=1,
            )

            if execution_result.get('success', execution_result.get('error') is None):
                await emit(
                    {
                        'type': 'done',
                        'success': True,
                        'result': execution_result.get('result'),
                        'logs': execution_result.get('logs', []),
                        'workflow_id': workflow_id,
                        'activity_id': activity_id,
                    }
                )
            else:
                error_msg = execution_result.get('error') or 'Sandbox execution failed'
                await emit(
                    {
                        'type': 'done',
                        'success': False,
                        'error': error_msg,
                        'traceback': execution_result.get('traceback'),
                        'result': execution_result.get('result'),
                        'logs': execution_result.get('logs', []),
                        'workflow_id': workflow_id,
                        'activity_id': activity_id,
                    }
                )
        except Exception as exc:
            import traceback

            logger.error('Streaming execution failed: %s\n%s', exc, traceback.format_exc())
            await emit({'type': 'error', 'content': str(exc)})

        await response.write_eof()
        return response

    async def handle_validate_workflow(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({'error': 'Invalid JSON'}, status=400)

        code = data.get('code')
        fn_name = data.get('fn_name')
        workflow_id = data.get('workflow_id') or f'workflow-validation-{uuid.uuid4()}'

        if not code or not fn_name:
            return web.json_response({'error': 'code and fn_name are required'}, status=400)

        validation_workflow_id = f'workflow-validation-{workflow_id}'
        validation_request = {
            'code': code,
            'fn_name': fn_name,
            'workflow_id': workflow_id,
            'input_data': data.get('input_data', {}),
            'timeout': data.get('timeout'),
            'task_queue': data.get('task_queue'),
        }

        try:
            logger.info(
                'Starting workflow validation %s on task queue %s',
                validation_workflow_id,
                self.validation_task_queue,
            )
            handle = await self.client.start_workflow(
                WorkflowValidationWorkflow.run,
                validation_request,
                id=validation_workflow_id,
                task_queue=self.validation_task_queue,
            )
            result = await handle.result()
            return web.json_response(
                {
                    'success': True,
                    'result': result,
                    'workflow_id': validation_workflow_id,
                }
            )
        except Exception as exc:
            import traceback

            logger.error('Workflow validation failed: %s\n%s', exc, traceback.format_exc())
            return web.json_response({'error': str(exc)}, status=500)

    async def handle_validate_workflow_stream(self, request: web.Request) -> web.StreamResponse:
        try:
            data = await request.json()
        except json.JSONDecodeError:
            response = web.StreamResponse(
                status=400,
                headers={
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            )
            await response.prepare(request)
            await response.write(
                f"data: {json.dumps({'type': 'error', 'content': 'Invalid JSON'}, ensure_ascii=False)}\n\n".encode(
                    'utf-8'
                )
            )
            await response.write_eof()
            return response

        code = data.get('code')
        fn_name = data.get('fn_name')
        workflow_id = data.get('workflow_id') or f'workflow-validation-{uuid.uuid4()}'
        input_data = data.get('input_data', {}) or {}
        task_queue = data.get('task_queue') or 'SKILL_TASK_QUEUE'

        response = web.StreamResponse(
            status=200,
            headers={
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        )
        await response.prepare(request)

        async def emit(event: dict):
            await response.write(f'data: {json.dumps(event, ensure_ascii=False)}\n\n'.encode('utf-8'))

        if not code or not fn_name:
            await emit({'type': 'error', 'content': 'code and fn_name are required'})
            await response.write_eof()
            return response

        async def emit_log(message: str):
            await emit({'type': 'log', 'content': message})

        try:
            await emit_log(f'[ValidationWorker] 开始真实验证 Workflow: {workflow_id}')
            await emit_log(f'[ValidationWorker] Workflow 类: {fn_name}')
            await emit_log(f'[ValidationWorker] 目标 Task Queue: {task_queue}')

            from sandbox_executor import execute_in_sandbox_streaming

            async def forward_log(message: str):
                await emit_log(f'[Workflow Attempt] {message}')

            execution_result = await execute_in_sandbox_streaming(
                code,
                fn_name,
                input_data,
                forward_log,
                attempt=1,
            )

            if execution_result.get('success', execution_result.get('error') is None):
                await emit_log('[ValidationWorker] Workflow 真实验证成功')
                await emit(
                    {
                        'type': 'done',
                        'success': True,
                        'result': execution_result.get('result'),
                        'logs': execution_result.get('logs', []),
                    }
                )
            else:
                error_msg = execution_result.get('error') or 'Workflow validation failed'
                await emit_log(f'[ValidationWorker] Workflow 真实验证失败: {error_msg}')
                await emit(
                    {
                        'type': 'done',
                        'success': False,
                        'error': error_msg,
                        'traceback': execution_result.get('traceback'),
                        'result': execution_result.get('result'),
                        'logs': execution_result.get('logs', []),
                    }
                )
        except Exception as exc:
            import traceback

            logger.error('Workflow streaming validation failed: %s\n%s', exc, traceback.format_exc())
            await emit({'type': 'error', 'content': str(exc)})

        await response.write_eof()
        return response


async def run_http_server(client: Client, validation_task_queue: str, port: int = 8090):
    server = TemporalSandboxServer(client, validation_task_queue)
    runner = web.AppRunner(server._app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    logger.info('HTTP server started on port %s', port)
    return runner
