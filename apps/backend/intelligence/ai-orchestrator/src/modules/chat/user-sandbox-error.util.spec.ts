import {
  extractSandboxExecutionDetail,
  classifyPersonalSandboxError,
  isSandboxExecutionError,
} from './user-sandbox-error.util';

describe('user-sandbox-error.util', () => {
  describe('extractSandboxExecutionDetail', () => {
    it('correctly extracts execution detail from final harness error line instead of traceback source code', () => {
      const rawErrorWithTraceback = `Traceback (most recent call last):
  File "/usr/local/bin/dsh_modules/runner.py", line 587, in cmd_run
    loop_res = run_agent_loop(
  File "/usr/local/bin/dsh_modules/docx_render_tool.py", line 185, in render_docx
    return _make_error(f"render_docx 执行异常: {str(e)}", provenance)
  File "/usr/local/bin/dsh_modules/docx_render_tool.py", line 63, in _make_error
    res = ToolResult.error(msg, provenance=provenance)
TypeError: ToolResult._error_result() missing 1 required positional argument: 'message'

❌ [DeepSeek Harness 异常]: 执行异常: ToolResult._error_result() missing 1 required positional argument: 'message'`;

      const detail = extractSandboxExecutionDetail(rawErrorWithTraceback);
      expect(detail).toBe("ToolResult._error_result() missing 1 required positional argument: 'message'");
      expect(detail).not.toContain('{str(e)}');
      expect(detail).not.toContain('provenance');
    });

    it('extracts detail from single-line harness error', () => {
      const msg = '❌ [DeepSeek Harness 异常]: 执行异常: openpyxl does not support .csv file format';
      expect(extractSandboxExecutionDetail(msg)).toBe('openpyxl does not support .csv file format');
    });

    it('extracts detail when multiple 执行异常 exist and filters out python f-string source code', () => {
      const complexMsg = `File "tool.py", line 10\n  f"工具执行异常: {str(e)}", provenance\n执行异常: ValueError: 文件无法解析`;
      const detail = extractSandboxExecutionDetail(complexMsg);
      expect(detail).toBe('ValueError: 文件无法解析');
    });
  });

  describe('classifyPersonalSandboxError with execution errors', () => {
    it('classifies traceback error cleanly into SANDBOX_TOOL_EXECUTION_ERROR', () => {
      const rawError = `  File "/usr/local/bin/dsh_modules/docx_render_tool.py", line 185, in render_docx
    return _make_error(f"render_docx 执行异常: {str(e)}", provenance)
❌ [DeepSeek Harness 异常]: 执行异常: ToolResult._error_result() missing 1 required positional argument: 'message'`;

      const res = classifyPersonalSandboxError({
        message: '生成word文件',
        errMsg: rawError,
        recentHistory: [],
        sessionAttachedFiles: [],
      });

      expect(res).not.toBeNull();
      expect(res?.eventData.code).toBe('SANDBOX_TOOL_EXECUTION_ERROR');
      expect(res?.friendlyError).toContain('❌ 沙箱工具执行异常：');
      expect(res?.friendlyError).not.toContain('{str(e)}');
      expect(res?.friendlyError).not.toContain('provenance');
      expect(res?.friendlyError).toContain("ToolResult._error_result() missing 1 required positional argument: 'message'");
    });
  });
});
