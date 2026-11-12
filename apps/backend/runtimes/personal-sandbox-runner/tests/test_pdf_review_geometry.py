"""Geometry evidence must describe the staged PDF and remain advisory."""
import json
from pathlib import Path
import tempfile
import unittest
from weasyprint import HTML
from dsh_modules.pdf_review_geometry import page_geometry_evidence


class GeometryEvidenceTests(unittest.TestCase):
    def test_footer_position_and_actual_character_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'candidate.pdf'
            HTML(string='''<style>@page {size: A4; margin: 40pt}
                .overlap {position:absolute;top:100pt;left:100pt}
                footer {position:fixed;bottom:-20pt;left:250pt}</style>
                <p>Normal readable text</p><span class="overlap">ABCD</span>
                <span class="overlap">ABCD</span><footer>4</footer>''').write_pdf(path)
            evidence = page_geometry_evidence(path, 1)
            facts = json.JSONDecoder().raw_decode(evidence[evidence.index('{'):])[0]
            self.assertEqual(facts['footer_text'][0]['text'], '4')
            self.assertGreater(facts['footer_text'][0]['bbox_pt'][0], 250)
            self.assertGreaterEqual(facts['high_overlap_char_pairs'], 4)
            self.assertIn('不构成视觉通过', evidence)

    def test_unreadable_auxiliary_pdf_does_not_replace_existing_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'invalid.pdf'
            path.write_bytes(b'%PDF-1.4\n')
            self.assertEqual(page_geometry_evidence(path, 1), '')
