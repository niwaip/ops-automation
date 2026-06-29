import { XmlPreprocessor } from './xml-preprocessor';

describe('XmlPreprocessor', () => {
  let preprocessor: XmlPreprocessor;

  beforeEach(() => {
    preprocessor = new XmlPreprocessor();
  });

  describe('flatten', () => {
    it('should merge adjacent <w:t> nodes', () => {
      const xml = '<w:t>{d.</w:t><w:t>name}</w:t>';
      const result = preprocessor.flatten(xml);

      expect(result).toBe('<w:t>{d.name}</w:t>');
    });

    it('should merge multiple adjacent <w:t> nodes', () => {
      const xml = '<w:t>{</w:t><w:t>d.</w:t><w:t>user</w:t><w:t>.name}</w:t>';
      const result = preprocessor.flatten(xml);

      expect(result).toBe('<w:t>{d.user.name}</w:t>');
    });

    it('should not merge nodes with xml:space attribute', () => {
      const xml = '<w:t>text</w:t><w:t xml:space="preserve">  more</w:t>';
      const result = preprocessor.flatten(xml);

      expect(result).toBe('<w:t>text</w:t><w:t xml:space="preserve">  more</w:t>');
    });

    it('should handle nested split markers in loops', () => {
      const xml =
        '<w:t>{#d.</w:t><w:t>items}</w:t><w:t>{d.items[i]</w:t><w:t>.name}</w:t><w:t>{/d.</w:t><w:t>items}</w:t>';
      const result = preprocessor.flatten(xml);

      expect(result).toBe('<w:t>{#d.items}{d.items[i].name}{/d.items}</w:t>');
    });

    it('should handle whitespace between nodes', () => {
      const xml = '<w:t>{d.</w:t>\n<w:t>name}</w:t>';
      const result = preprocessor.flatten(xml);

      expect(result).toBe('<w:t>{d.name}</w:t>');
    });

    it('should handle real Word document fragment', () => {
      const xml = `<w:r>
        <w:t>{d.</w:t>
        <w:t>operations.</w:t>
        <w:t>navigate}</w:t>
      </w:r>`;
      const result = preprocessor.flatten(xml);

      expect(result).toContain('{d.operations.navigate}');
    });
  });

  describe('preprocessMarkers', () => {
    it('should repair split markers with XML tags inside', () => {
      const xml = '{</w:t><w:t>d.name</w:t><w:t>}';
      const result = preprocessor.preprocessMarkers(xml);

      expect(result).toBe('{d.name}');
    });

    it('should handle markers with formatters', () => {
      const xml = '{</w:t><w:t>d.price:formatNumber</w:t><w:t>}';
      const result = preprocessor.preprocessMarkers(xml);

      expect(result).toBe('{d.price:formatNumber}');
    });
  });

  describe('detectIssues', () => {
    it('should detect unbalanced braces', () => {
      const xml = '<w:t>{d.name</w:t><w:t>{d.age}</w:t>';
      const issues = preprocessor.detectIssues(xml);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'unbalanced_braces')).toBe(true);
    });

    it('should return empty issues for valid XML', () => {
      const xml = '<w:t>{d.name}</w:t><w:t>{d.age}</w:t>';
      const issues = preprocessor.detectIssues(xml);

      expect(issues.filter((i) => i.type === 'unbalanced_braces')).toHaveLength(0);
    });
  });

  describe('process', () => {
    it('should return processed XML and issues', () => {
      const xml = '<w:t>{d.</w:t><w:t>name}</w:t>';
      const result = preprocessor.process(xml);

      expect(result.xml).toBe('<w:t>{d.name}</w:t>');
      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should repair split markers in xlsx sharedStrings <t> nodes without breaking XML structure', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">
  <si>
    <r><t>{d.latePayment</t></r>
    <r><t>PenaltyRatio}</t></r>
  </si>
</sst>`;
      const result = preprocessor.process(xml);
      expect(result.xml).toContain('<r><t>{d.latePaymentPenaltyRatio}</t></r>');
      expect(result.xml).toContain('<r><t></t></r>');
    });

    it('should not merge markers across different sharedStrings <si> entries', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
  <si><r><t>{d.latePayment</t></r></si>
  <si><r><t>PenaltyRatio}</t></r></si>
</sst>`;
      const result = preprocessor.process(xml);
      expect(result.xml).toContain('<si><r><t>{d.latePayment</t></r></si>');
      expect(result.xml).toContain('<si><r><t>PenaltyRatio}</t></r></si>');
      expect(result.xml).not.toContain('{d.latePaymentPenaltyRatio}');
    });

    it('should apply full preprocessing pipeline', () => {
      const xml = `<w:p>
        <w:r>
          <w:t>Hello {d.</w:t>
          <w:t>user.name</w:t>
          <w:t>}, your order {d.</w:t>
          <w:t>order</w:t>
          <w:t>.id} is ready</w:t>
        </w:r>
      </w:p>`;
      const result = preprocessor.process(xml);

      expect(result.xml).toContain('{d.user.name}');
      expect(result.xml).toContain('{d.order.id}');
    });
  });
});
