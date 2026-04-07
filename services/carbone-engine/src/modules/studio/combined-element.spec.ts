/**
 * Test for Carbone tag injection in Word documents
 */

import { DocumentStructureParser } from './document-structure.service';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import JSZip from 'jszip';

describe('DocumentStructureParser Tag Injection', () => {
  let parser: DocumentStructureParser;

  beforeEach(() => {
    parser = new DocumentStructureParser();
  });

  it('should inject a single tag and clear multiple text nodes', () => {
    const doc = new DOMParser().parseFromString(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r><w:t>Part 1 </w:t></w:r>
        <w:r><w:t>Part 2</w:t></w:r>
      </w:p>
    `, 'text/xml');
    const p = doc.getElementsByTagNameNS('*', 'p')[0];

    // Accessing private method for testing
    (parser as any).injectTextToElement(p, '{d.variable}');

    const textNodes = p.getElementsByTagNameNS('*', 't');
    expect(textNodes.length).toBe(1);
    expect(textNodes[0].textContent).toBe('{d.variable}');
    expect((textNodes[0] as any).getAttribute('xml:space')).toBe('preserve');
  });

  it('should handle prefix and suffix correctly', () => {
    const doc = new DOMParser().parseFromString(`
      <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:r><w:t>Original Text</w:t></w:r>
      </w:p>
    `, 'text/xml');
    const p = doc.getElementsByTagNameNS('*', 'p')[0];

    (parser as any).prefixTextToElement(p, '{#loop}');
    (parser as any).suffixTextToElement(p, '{/loop}');

    const textNodes = p.getElementsByTagNameNS('*', 't');
    expect(textNodes[0].textContent).toBe('{#loop}Original Text{/loop}');
  });

  it('should correctly inject combined variable loops (text + image paragraphs)', async () => {
      const doc = new DOMParser().parseFromString(`
        <w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <w:p><w:r><w:t>Step 1: screenshot</w:t></w:r></w:p>
          <w:p>
            <w:r>
              <w:drawing>
                <wp:inline>
                  <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                    <a:graphicData>
                      <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                        <pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill>
                      </pic:pic>
                    </a:graphicData>
                  </a:graphic>
                </wp:inline>
              </w:drawing>
            </w:r>
          </w:p>
          <w:p><w:r><w:t>Step 2: screenshot</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><wp:inline><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        </w:body>
      `, 'text/xml');
      
      const body = doc.documentElement;
      const elements = (parser as any).collectElements(body);
      
      // Expected behavior:
      const screenshotPairs: any[] = [];
      const stepPattern = /Step\s+(\d+)[:：]\s*screenshot/i;

      for (let i = 0; i < elements.length - 1; i++) {
        const node = elements[i];
        const text = (parser as any).getNodeText(node);
        if (stepPattern.test(text) && (parser as any).isImageElement(elements[i+1])) {
            screenshotPairs.push({ textNode: elements[i], imageNode: elements[i+1] });
        }
      }

      expect(screenshotPairs.length).toBe(2);

      // Apply logic
      const templatePair = screenshotPairs[0];
      (parser as any).injectTextToElement(templatePair.textNode, `{d.screenshots[].description}`);
      (parser as any).injectImageVariable(templatePair.imageNode, `d.screenshots[].url`);
      (parser as any).prefixTextToElement(templatePair.textNode, `{#d.screenshots}`);
      (parser as any).suffixTextToElement(templatePair.imageNode, `{/d.screenshots}`);

      // Cleanup others
      for (let i = screenshotPairs.length - 1; i >= 1; i--) {
        const pair = screenshotPairs[i];
        pair.imageNode.parentNode.removeChild(pair.imageNode);
        pair.textNode.parentNode.removeChild(pair.textNode);
      }

      const finalXml = new XMLSerializer().serializeToString(doc);
      expect(finalXml).toContain('{#d.screenshots}{d.screenshots[].description}');
      // New format: {d.screenshots[].url:formatImage(rId1)} appended to existing text node (if any) or new one
      expect(finalXml).toContain('{d.screenshots[].url:formatImage(rId1)}');
      expect(finalXml).toContain('{/d.screenshots}');
      // Should have removed the second pair
      expect(finalXml).not.toContain('Step 2: screenshot');
  });

  describe('applyConfigToDocx Integration', () => {
    async function createMockDocx(xml: string): Promise<Buffer> {
      const zip = new JSZip();
      zip.file('word/document.xml', xml);
      return zip.generateAsync({ type: 'nodebuffer' });
    }

    it('should handle combinedVariables (step-screenshot) correctly', async () => {
      const documentXml = `
        <w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <w:p><w:r><w:t>Step 1: screenshot</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><wp:inline><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>Step 2: screenshot</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><wp:inline><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
        </w:body>
      `;

      const buffer = await createMockDocx(documentXml);
      const config = {
        combinedVariables: [
          {
            type: 'step-screenshot',
            imagePath: 'd.steps[].screenshot'
          }
        ]
      };

      const resultBuffer = await parser.applyConfigToDocx(buffer, config);
      
      const resultZip = new JSZip();
      await resultZip.loadAsync(resultBuffer);
      const resultXml = await resultZip.file('word/document.xml')?.async('text');

      expect(resultXml).toContain('{#d.steps}{d.steps[].description}');
      expect(resultXml).toContain('{d.steps[].screenshot:formatImage(rId1)}');
      expect(resultXml).toContain('{/d.steps}');
      expect(resultXml).not.toContain('Step 2: screenshot');
    });

    it('should handle elementGroups and ignoredElements', async () => {
      const documentXml = `
        <w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:p><w:r><w:t>Group Start</w:t></w:r></w:p>
          <w:p><w:r><w:t>Middle</w:t></w:r></w:p>
          <w:p><w:r><w:t>Group End</w:t></w:r></w:p>
          <w:p><w:r><w:t>Delete Me</w:t></w:r></w:p>
        </w:body>
      `;

      const buffer = await createMockDocx(documentXml);
      const config = {
        elementGroups: {
          '#loop': [0, 2]
        },
        ignoredElements: [3]
      };

      const resultBuffer = await parser.applyConfigToDocx(buffer, config);
      
      const resultZip = new JSZip();
      await resultZip.loadAsync(resultBuffer);
      const resultXml = await resultZip.file('word/document.xml')?.async('text');

      expect(resultXml).toContain('{#loop}Group Start');
      expect(resultXml).toContain('Group End{/loop}');
      expect(resultXml).not.toContain('Delete Me');
    });
  });
});
