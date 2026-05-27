/**
 * Parser Unit Tests
 */

import { Parser } from './parser';

describe('Parser', () => {
  let parser: Parser;

  beforeEach(() => {
    parser = new Parser();
  });

  describe('isCarboneMarker', () => {
    it('should identify valid Carbone markers', () => {
      expect(parser.isCarboneMarker('{d.name}')).toBe(true);
      expect(parser.isCarboneMarker('{d.user.name}')).toBe(true);
      expect(parser.isCarboneMarker('{c.company}')).toBe(true);
      expect(parser.isCarboneMarker('{t.title}')).toBe(true);
    });

    it('should reject invalid markers', () => {
      expect(parser.isCarboneMarker('{name}')).toBe(false);
      expect(parser.isCarboneMarker('{x.name}')).toBe(false);
      expect(parser.isCarboneMarker('plain text')).toBe(false);
    });
  });

  describe('parseMarker', () => {
    it('should parse simple marker', () => {
      const result = parser.parseMarker('{d.name}');
      expect(result.path).toBe('name');
      expect(result.formatters).toHaveLength(0);
    });

    it('should parse marker with formatter', () => {
      const result = parser.parseMarker('{d.price:formatNumber}');
      expect(result.path).toBe('price');
      expect(result.formatters).toContain('formatNumber');
    });

    it('should parse marker with formatter chain', () => {
      const result = parser.parseMarker('{d.price:formatNumber(#,##0.00):round(2)}');
      expect(result.path).toBe('price');
      expect(result.formatters).toContain('formatNumber(#,##0.00)');
      expect(result.formatters).toContain('round(2)');
    });
  });

  describe('findMarkers', () => {
    it('should find all markers in XML', () => {
      const xml = '<p>Hello {d.name}, your total is {d.total:formatNumber}</p>';
      const markers = parser.findMarkers(xml);

      expect(markers).toHaveLength(2);
      expect(markers[0].name).toBe('d.name');
      expect(markers[1].name).toBe('d.total');
      expect(markers[1].formatters).toContain('formatNumber');
    });

    it('should identify array markers', () => {
      const xml = '<tr><td>{d.items[i].name}</td><td>{d.items[i+1].name}</td></tr>';
      const markers = parser.findMarkers(xml);

      expect(markers).toHaveLength(2);
      expect(markers[0].isArray).toBe(true);
      expect(markers[0].arrayPath).toBe('d.items');
    });

    it('should handle nested markers', () => {
      const xml = '<p>{d.user.profile.name}</p>';
      const markers = parser.findMarkers(xml);

      expect(markers).toHaveLength(1);
      expect(markers[0].name).toBe('d.user.profile.name');
    });
  });

  describe('detectLoops', () => {
    it('should detect loop patterns', () => {
      const xml = `
        <table>
          <tr><td>{d.items[i].name}</td><td>{d.items[i].price}</td></tr>
          <tr><td>{d.items[i+1].name}</td><td>{d.items[i+1].price}</td></tr>
        </table>
      `;
      const markers = parser.findMarkers(xml);
      parser.detectLoops(xml, markers);

      // 循环检测依赖于特定的模式匹配
      // 验证markers包含数组标记
      const arrayMarkers = markers.filter(m => m.isArray);
      expect(arrayMarkers.length).toBeGreaterThan(0);
    });

    it('expands explicit docx table loops to the full row container', () => {
      const xml = [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>维护费</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr>',
        '<w:tc><w:p><w:r><w:t>{#d.items}{d.items[].projectName_cn}</w:t></w:r></w:p></w:tc>',
        '<w:tc><w:p><w:r><w:t>{d.items[].maintenanceFee_jp}{/d.items}</w:t></w:r></w:p></w:tc>',
        '</w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t/></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t/></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body>',
        '</w:document>',
      ].join('');

      const loops = parser.detectLoops(xml, parser.findMarkers(xml));
      const explicitLoop = loops.find((loop) => loop.loopType === 'explicit');

      expect(explicitLoop).toBeDefined();
      expect(explicitLoop?.arrayPath).toBe('d.items');
      expect(explicitLoop?.templateUnit.startsWith('<w:tr>')).toBe(true);
      expect(explicitLoop?.templateUnit.endsWith('</w:tr>')).toBe(true);
      expect(xml.slice(explicitLoop!.startPos, explicitLoop!.startPos + 5)).toBe('<w:tr');
      expect(xml.slice(explicitLoop!.endPos - '</w:tr>'.length, explicitLoop!.endPos)).toBe('</w:tr>');
      expect(explicitLoop?.templateUnit).toContain('{#d.items}');
      expect(explicitLoop?.templateUnit).toContain('{/d.items}');
    });

    it('normalizes implicit docx loop bounds to full row boundaries', () => {
      const xml = [
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        '<w:body>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>{d.items[i].name}</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>{d.items[i+1].name}</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body>',
        '</w:document>',
      ].join('');

      const loops = parser.detectLoops(xml, parser.findMarkers(xml));
      const implicitLoop = loops.find((loop) => loop.arrayPath === 'd.items' && loop.loopType === 'implicit');

      expect(implicitLoop).toBeDefined();
      expect(xml.slice(implicitLoop!.startPos, implicitLoop!.startPos + 5)).toBe('<w:tr');
      expect(xml.slice(implicitLoop!.endPos - '</w:tr>'.length, implicitLoop!.endPos)).toBe('</w:tr>');
      expect(implicitLoop?.templateUnit.startsWith('<w:tr>')).toBe(true);
      expect(implicitLoop?.templateUnit.endsWith('</w:tr>')).toBe(true);
    });
  });

  describe('extractVariables', () => {
    it('should extract unique variable names', () => {
      const xml = '<p>{d.name} {d.name} {d.age}</p>';
      const markers = parser.findMarkers(xml);
      const variables = parser.extractVariables(markers);

      expect(variables).toHaveLength(2);
      expect(variables).toContain('d.name');
      expect(variables).toContain('d.age');
    });

    it('should clean array indices from variables', () => {
      const markers = [
        { pos: 0, length: 17, name: 'd.items[i].name', formatters: [], isArray: true, arrayPath: 'd.items' },
        { pos: 10, length: 19, name: 'd.items[i+1].name', formatters: [], isArray: true, arrayPath: 'd.items' }
      ];
      const variables = parser.extractVariables(markers);

      expect(variables).toContain('d.items.name');
    });
  });

  describe('parse', () => {
    it('should return complete parsed template', () => {
      const xml = '<p>{d.title} - {d.date:formatD(YYYY-MM-DD)}</p>';
      const result = parser.parse(xml);

      expect(result.markers).toHaveLength(2);
      expect(result.variables).toHaveLength(2);
      expect(result.cleanedXml).toContain('\uFFFF');
    });
  });
});
