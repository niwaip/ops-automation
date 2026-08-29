import {
  buildBrowserCapabilityOutputSchema,
} from './browser-capability-output.schema';

describe('buildBrowserCapabilityOutputSchema', () => {
  it('does not advertise a fabricated summary for a browser-only recording', () => {
    const schema = buildBrowserCapabilityOutputSchema({
      runtimeMetadata: {
        executionPlan: {
          outputs: [
            { name: 'browserRunOutput', type: 'object' },
            { name: 'pageState', type: 'object' },
          ],
        },
      },
      declaredOutputSchema: {
        properties: {
          text: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    });

    expect(schema.primaryOutput).toBe('text');
    expect(schema.required).toEqual([]);
    expect(schema.properties).toMatchObject({
      text: expect.objectContaining({ type: 'string' }),
      browserRunOutput: expect.objectContaining({ type: 'object' }),
      pageState: expect.objectContaining({ type: 'object' }),
    });
    expect((schema.properties as Record<string, unknown>).summary).toBeUndefined();
  });

  it('projects declared composition content outputs', () => {
    const schema = buildBrowserCapabilityOutputSchema({
      composition: {
        outputDeclarations: [
          { name: 'article_content', kind: 'content' },
        ],
      },
    });

    expect(schema.properties).toMatchObject({
      article_content: { type: 'string', valueType: 'string' },
    });
  });
});
