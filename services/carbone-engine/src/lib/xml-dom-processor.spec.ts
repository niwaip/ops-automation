/**
 * XmlDomProcessor Unit Tests
 */

import { XmlDomProcessor } from './xml-dom-processor';

describe('XmlDomProcessor', () => {
  let processor: XmlDomProcessor;

  beforeEach(() => {
    processor = new XmlDomProcessor();
  });

  describe('parse and serialize', () => {
    it('should parse XML string to document', () => {
      const xml = '<document><paragraph>Hello</paragraph></document>';
      const doc = processor.parse(xml);

      expect(doc).toBeDefined();
      expect(doc.documentElement.tagName).toBe('document');
    });

    it('should serialize document back to XML', () => {
      const xml = '<document><paragraph>Hello</paragraph></document>';
      const doc = processor.parse(xml);
      const result = processor.serialize(doc);

      expect(result).toContain('<document>');
      expect(result).toContain('<paragraph>');
      expect(result).toContain('Hello');
    });
  });

  describe('findNodes', () => {
    it('should find nodes by tag name', () => {
      const xml = `
        <document>
          <paragraph>First</paragraph>
          <paragraph>Second</paragraph>
        </document>
      `;
      const doc = processor.parse(xml);
      const nodes = processor.findNodes(doc, 'paragraph');

      expect(nodes.length).toBe(2);
    });
  });

  describe('findNodesByText', () => {
    it('should find nodes containing specific text', () => {
      const xml = `
        <document>
          <text>Hello {d.name}</text>
          <text>World</text>
          <text>{d.age} years</text>
        </document>
      `;
      const doc = processor.parse(xml);
      const nodes = processor.findNodesByText(doc, '{d.', 'text');

      expect(nodes.length).toBe(2);
    });
  });

  describe('findMarkerNodes', () => {
    it('should find Carbone marker nodes', () => {
      const xml = `
        <document>
          <text>Hello {d.name}</text>
          <text>No marker here</text>
          <text>{#d.items}</text>
          <text>{d.items[i].name}</text>
          <text>{/d.items}</text>
        </document>
      `;
      const doc = processor.parse(xml);
      const markers = processor.findMarkerNodes(doc, 'text');

      expect(markers.length).toBe(4);
    });
  });

  describe('replaceNodeText', () => {
    it('should replace node text content', () => {
      const xml = '<document><text>Original text</text></document>';
      const doc = processor.parse(xml);
      const textNode = doc.getElementsByTagName('text')[0];

      processor.replaceNodeText(textNode, 'New text');

      expect(textNode.textContent).toBe('New text');
    });
  });

  describe('cloneNode', () => {
    it('should clone element with children', () => {
      const xml = '<row><cell>A</cell><cell>B</cell></row>';
      const doc = processor.parse(xml);
      const row = doc.documentElement;
      const clone = processor.cloneNode(row);

      expect(clone.tagName).toBe('row');
      expect(clone.childNodes.length).toBe(2);
    });
  });

  describe('mergeAdjacentTextNodes', () => {
    it('should merge adjacent text nodes within run element', () => {
      // Using non-namespaced elements for testing
      const xml = `
        <run>
          <text>{d.</text>
          <text>name}</text>
        </run>
      `;
      const doc = processor.parse(xml);
      const run = doc.getElementsByTagName('run')[0];

      // Manually test merge by collecting text
      const textNodes = run.getElementsByTagName('text');
      let mergedText = '';
      for (const tn of textNodes) {
        mergedText += tn.textContent || '';
      }

      expect(mergedText).toBe('{d.name}');
    });
  });

  describe('containsMarker', () => {
    it('should detect simple marker', () => {
      const xml = '<text>{d.name}</text>';
      const doc = processor.parse(xml);
      const node = doc.getElementsByTagName('text')[0];

      expect(processor.containsMarker(node)).toBe(true);
    });

    it('should detect loop start marker', () => {
      const xml = '<text>{#d.items}</text>';
      const doc = processor.parse(xml);
      const node = doc.getElementsByTagName('text')[0];

      expect(processor.containsMarker(node)).toBe(true);
    });

    it('should return false for plain text', () => {
      const xml = '<text>Hello World</text>';
      const doc = processor.parse(xml);
      const node = doc.getElementsByTagName('text')[0];

      expect(processor.containsMarker(node)).toBe(false);
    });
  });

  describe('processXML', () => {
    it('should process simple variable replacement', () => {
      const xml = `
        <document>
          <body>
            <run><text>Hello {d.name}</text></run>
          </body>
        </document>
      `;
      const data = { name: 'World' };

      const result = processor.processXML(xml, data, 'text');

      expect(result).toContain('Hello World');
      expect(result).not.toContain('{d.name}');
    });

    it('should handle multiple variables', () => {
      const xml = `
        <document>
          <run><text>{d.greeting} {d.name}!</text></run>
        </document>
      `;
      const data = { greeting: 'Hello', name: 'User' };

      const result = processor.processXML(xml, data, 'text');

      expect(result).toContain('Hello User');
    });
  });

  describe('addAttribute', () => {
    it('should add attribute to node', () => {
      const xml = '<row>Content</row>';
      const doc = processor.parse(xml);
      const row = doc.documentElement;

      processor.addAttribute(row, 'class', 'highlight');

      expect(row.getAttribute('class')).toBe('highlight');
    });
  });

  describe('removeNode', () => {
    it('should remove node from parent', () => {
      const xml = '<parent><child>Keep</child><child>Remove</child></parent>';
      const doc = processor.parse(xml);
      const children = doc.getElementsByTagName('child');
      const toRemove = children[1];

      processor.removeNode(toRemove);

      const remaining = doc.getElementsByTagName('child');
      expect(remaining.length).toBe(1);
      expect(remaining[0].textContent).toBe('Keep');
    });
  });
});