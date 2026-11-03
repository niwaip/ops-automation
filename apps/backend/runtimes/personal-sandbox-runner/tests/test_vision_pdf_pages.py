import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Defensive mocking of PIL and pdf2image if not installed locally
try:
    from PIL import Image
except ImportError:
    mock_pil = MagicMock()
    mock_pil.__version__ = "10.0.0"
    mock_image_cls = MagicMock()
    mock_pil.Image = mock_image_cls
    sys.modules['PIL'] = mock_pil
    sys.modules['PIL.Image'] = mock_image_cls
    Image = mock_image_cls

try:
    import pdf2image
except ImportError:
    mock_pdf2image = MagicMock()
    sys.modules['pdf2image'] = mock_pdf2image
    pdf2image = mock_pdf2image

import pypdf

import dsh_modules.config
from dsh_modules.file_tools import inspect_image
from dsh_modules.tools import execute_tool


def fake_save(buf, *args, **kwargs):
    buf.write(b"\xff\xd8\xff\xe0" + b"\x00" * 32)


class VisionPdfPagesTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.tmp_dir.name)
        dsh_modules.config.WORKSPACE_DIR = str(self.workspace)

        # 创建一个 3 页的测试 PDF
        self.pdf_path = self.workspace / "test_doc.pdf"
        writer = pypdf.PdfWriter()
        for idx in range(3):
            writer.add_blank_page(width=300, height=300)
        with open(self.pdf_path, "wb") as f:
            writer.write(f)

    def tearDown(self):
        self.tmp_dir.cleanup()

    @patch("dsh_modules.file_tools.validate_image_bytes", return_value=None)
    @patch("pdf2image.convert_from_path")
    @patch("urllib.request.urlopen")
    def test_inspect_image_specific_page(self, mock_urlopen, mock_pdf2image, mock_validate):
        mock_img = MagicMock()
        mock_img.convert.return_value.save.side_effect = fake_save
        mock_pdf2image.return_value = [mock_img]

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "这是第2页的内容：包含架构图与技术指标。"}}],
            "model": "qwen36-35b-a3b",
            "usage": {"prompt_tokens": 100, "completion_tokens": 20}
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # 1. 显式指定 page=2
        res = inspect_image(str(self.pdf_path), prompt="提取内容", page=2)
        self.assertIn("第 2 页", res)
        self.assertIn("全档共 3 页", res)
        self.assertIn("这是第2页的内容", res)
        # 验证 pdf2image 调用了 target_page=2
        mock_pdf2image.assert_called_with(str(self.pdf_path.resolve()), dpi=150, first_page=2, last_page=2)

    @patch("dsh_modules.file_tools.validate_image_bytes", return_value=None)
    @patch("pdf2image.convert_from_path")
    @patch("urllib.request.urlopen")
    def test_inspect_image_prompt_page_detection(self, mock_urlopen, mock_pdf2image, mock_validate):
        mock_img = MagicMock()
        mock_img.convert.return_value.save.side_effect = fake_save
        mock_pdf2image.return_value = [mock_img]

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "第3页产品规格参数。"}}],
            "model": "qwen36-35b-a3b",
            "usage": {"prompt_tokens": 100, "completion_tokens": 20}
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # 2. 从 prompt 自动推断第 3 页
        res = inspect_image(str(self.pdf_path), prompt="请详细查看第3页的内容")
        self.assertIn("第 3 页", res)
        self.assertIn("第3页产品规格参数", res)
        mock_pdf2image.assert_called_with(str(self.pdf_path.resolve()), dpi=150, first_page=3, last_page=3)

    @patch("dsh_modules.file_tools.validate_image_bytes", return_value=None)
    @patch("pdf2image.convert_from_path")
    @patch("urllib.request.urlopen")
    def test_inspect_image_multi_page_stitching(self, mock_urlopen, mock_pdf2image, mock_validate):
        mock_img1 = MagicMock(width=100, height=100)
        mock_img2 = MagicMock(width=100, height=100)
        mock_pdf2image.return_value = [mock_img1, mock_img2]

        mock_stitched = MagicMock()
        mock_stitched.save.side_effect = fake_save
        Image.new.return_value = mock_stitched

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "前两页全景概览。"}}],
            "model": "qwen36-35b-a3b",
            "usage": {"prompt_tokens": 100, "completion_tokens": 20}
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # 3. 指定范围 page="1-2"
        res = inspect_image(str(self.pdf_path), prompt="查看概览", page="1-2")
        self.assertIn("当前已拼接检测 第 1 页, 第 2 页", res)
        self.assertIn("前两页全景概览", res)

    @patch("dsh_modules.file_tools.validate_image_bytes", return_value=None)
    @patch("pdf2image.convert_from_path")
    @patch("urllib.request.urlopen")
    def test_tool_dispatch_passes_page(self, mock_urlopen, mock_pdf2image, mock_validate):
        mock_img = MagicMock()
        mock_img.convert.return_value.save.side_effect = fake_save
        mock_pdf2image.return_value = [mock_img]

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "通过工具调度查看第2页。"}}],
            "model": "qwen36-35b-a3b",
            "usage": {"prompt_tokens": 100, "completion_tokens": 20}
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # 4. 测试 tools.py 中的 execute_tool 派发 page 参数
        result = execute_tool("vision_inspect", {
            "file_path": "test_doc.pdf",
            "page": 2,
            "prompt": "提取参数"
        })
        self.assertIn("第 2 页", str(result))
        self.assertIn("通过工具调度查看第2页", str(result))


if __name__ == "__main__":
    unittest.main()
