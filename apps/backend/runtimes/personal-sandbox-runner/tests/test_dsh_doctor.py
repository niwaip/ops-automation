"""
Unit tests for DeepSeek Harness (dsh) Doctor diagnostics module.
Verifies critical dependency assertions, model gateway reachability checks,
and health status evaluation.
"""

import io
import sys
import unittest
import urllib.error
from unittest.mock import patch, MagicMock

from dsh_modules.doctor import (
    check_python_modules,
    check_connectivity,
    run_doctor_checks,
    cmd_doctor,
)


class TestDshDoctor(unittest.TestCase):
    def test_pptx_is_required_core_dependency(self):
        """[P2] 验证 python-pptx 属于核心必须依赖 (required=True)，缺失时状态为 FAIL"""
        results = check_python_modules()
        pptx_check = next((c for c in results if c["name"] == "python-pptx"), None)
        self.assertIsNotNone(pptx_check)
        self.assertTrue(pptx_check["required"], "python-pptx 必须被标记为 required=True")

        # 模拟 pptx 缺失场景，必须为 FAIL 而非 WARN
        orig_import = __import__

        def mock_import(name, *args, **kwargs):
            if name == "pptx":
                raise ImportError("No module named 'pptx'")
            return orig_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mocked_results = check_python_modules()
            mocked_pptx = next(c for c in mocked_results if c["name"] == "python-pptx")
            self.assertEqual(mocked_pptx["status"], "FAIL")
            self.assertTrue(mocked_pptx["required"])

    def test_model_proxy_alive_status_codes(self):
        """[P2] 验证模型网关返回 200 或 4xx 存活响应码时判定为 PASS"""
        # 1. 200 OK
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        with patch("urllib.request.urlopen", return_value=mock_resp):
            results = check_connectivity()
            gw_check = next(c for c in results if c["name"] == "模型代理网关")
            self.assertEqual(gw_check["status"], "PASS")
            self.assertTrue(gw_check["required"])

        # 2. 404 / 401 / 405 (第 7 层存活响应)
        for code in [401, 403, 404, 405]:
            http_err = urllib.error.HTTPError(
                url="http://test/ai/proxy/v1",
                code=code,
                msg="Client Error",
                hdrs={},
                fp=io.BytesIO(b""),
            )
            with patch("urllib.request.urlopen", side_effect=http_err):
                results = check_connectivity()
                gw_check = next(c for c in results if c["name"] == "模型代理网关")
                self.assertEqual(gw_check["status"], "PASS", f"HTTP {code} 应视作网关存活")
                self.assertTrue(gw_check["required"])

    def test_model_proxy_server_error_status_codes(self):
        """[P2] 验证模型网关返回 5xx (500/502/503/504) 时判定为 FAIL，禁止视为可用"""
        for code in [500, 502, 503, 504]:
            http_err = urllib.error.HTTPError(
                url="http://test/ai/proxy/v1",
                code=code,
                msg="Server Error",
                hdrs={},
                fp=io.BytesIO(b""),
            )
            with patch("urllib.request.urlopen", side_effect=http_err):
                results = check_connectivity()
                gw_check = next(c for c in results if c["name"] == "模型代理网关")
                self.assertEqual(gw_check["status"], "FAIL", f"HTTP {code} 必须判定为 FAIL")
                self.assertTrue(gw_check["required"])
                self.assertIn("网关服务故障", gw_check["detail"])

    def test_model_proxy_connection_failure_is_critical_fail(self):
        """[P2] 验证网关无法连接时标记为 FAIL 与 required=True，禁止弱化为 WARN"""
        url_err = urllib.error.URLError("Connection refused")
        with patch("urllib.request.urlopen", side_effect=url_err):
            results = check_connectivity()
            gw_check = next(c for c in results if c["name"] == "模型代理网关")
            self.assertEqual(gw_check["status"], "FAIL")
            self.assertTrue(gw_check["required"])
            self.assertIn("网关无法连接", gw_check["detail"])

    def test_doctor_overall_health_when_gateway_unreachable(self):
        """[P2] 验证当核心模型网关不可达时，整体健康度必须为 False 且退出码为 1，杜绝宣称‘优秀’"""
        url_err = urllib.error.URLError("Connection refused")
        with patch("urllib.request.urlopen", side_effect=url_err):
            is_healthy, checks = run_doctor_checks()
            self.assertFalse(is_healthy, "网关不可达时，is_healthy 必须为 False")

            # 验证 cmd_doctor CLI 输出
            buf = io.StringIO()
            with patch("sys.stdout", buf):
                exit_code = cmd_doctor()
            output = buf.getvalue()

            self.assertEqual(exit_code, 1)
            self.assertIn("存在异常", output)
            self.assertNotIn("整体健康状态: 优秀", output)

    def test_doctor_overall_health_when_server_error(self):
        """[P2] 验证当网关返回 502 Bad Gateway 时，整体健康度必须为 False 且返回 1"""
        http_502 = urllib.error.HTTPError(
            url="http://test/ai/proxy/v1",
            code=502,
            msg="Bad Gateway",
            hdrs={},
            fp=io.BytesIO(b""),
        )
        with patch("urllib.request.urlopen", side_effect=http_502):
            is_healthy, _ = run_doctor_checks()
            self.assertFalse(is_healthy)

            buf = io.StringIO()
            with patch("sys.stdout", buf):
                exit_code = cmd_doctor()
            output = buf.getvalue()

            self.assertEqual(exit_code, 1)
            self.assertIn("存在异常", output)
            self.assertNotIn("整体健康状态: 优秀", output)

    def test_doctor_healthy_grading_distinction(self):
        """验证所有依赖就绪时输出‘优秀’，有可选警告时输出‘良好’"""
        # 1. 模拟所有检查完全 PASS
        mock_perfect_checks = [
            {"category": "Python 核心依赖", "name": "python-docx", "status": "PASS", "required": True, "detail": "ok"},
            {"category": "通信与网络通道", "name": "模型代理网关", "status": "PASS", "required": True, "detail": "ok"},
        ]
        with patch("dsh_modules.doctor.run_doctor_checks", return_value=(True, mock_perfect_checks)):
            buf = io.StringIO()
            with patch("sys.stdout", buf):
                exit_code = cmd_doctor()
            output = buf.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("整体健康状态: 优秀", output)

        # 2. 模拟存在可选警告 (WARN) 但无核心失败 (FAIL)
        mock_warn_checks = [
            {"category": "Python 核心依赖", "name": "python-docx", "status": "PASS", "required": True, "detail": "ok"},
            {"category": "Python 核心依赖", "name": "playwright", "status": "WARN", "required": False, "detail": "optional missing"},
            {"category": "通信与网络通道", "name": "模型代理网关", "status": "PASS", "required": True, "detail": "ok"},
        ]
        with patch("dsh_modules.doctor.run_doctor_checks", return_value=(True, mock_warn_checks)):
            buf = io.StringIO()
            with patch("sys.stdout", buf):
                exit_code = cmd_doctor()
            output = buf.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("整体健康状态: 良好", output)
            self.assertNotIn("整体健康状态: 优秀", output)


if __name__ == "__main__":
    unittest.main()
