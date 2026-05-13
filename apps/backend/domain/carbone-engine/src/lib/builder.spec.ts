import { Builder } from './builder';

describe('Builder', () => {
  it('escapes xml special characters when replacing scalar markers', () => {
    const builder = new Builder();
    const xml = '<si><t>{d.qualityLiability}</t></si>';
    const result = builder.buildXML(xml, { qualityLiability: 'A&B <C> "D" \'E\'' });
    expect(result.xml).toBe('<si><t>A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;</t></si>');
  });

  it('replaces all occurrences of the same marker', () => {
    const builder = new Builder();
    const xml = '<root><t>{d.name}</t><t>{d.name}</t></root>';
    const result = builder.buildXML(xml, { name: 'X' });
    expect(result.xml).toBe('<root><t>X</t><t>X</t></root>');
  });
});

