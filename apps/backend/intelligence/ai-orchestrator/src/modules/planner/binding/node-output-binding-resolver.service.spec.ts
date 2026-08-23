import { NodeOutputBindingResolverService } from './node-output-binding-resolver.service';

describe('NodeOutputBindingResolverService', () => {
  const resolver = new NodeOutputBindingResolverService();

  it('binds the unique semantic text output', () => {
    expect(
      resolver.resolveNodeOutputBinding(
        'n1',
        { status: 'string', markdown_content: 'markdown_content' },
        'content',
      ),
    ).toEqual({
      source: 'node_output',
      nodeId: 'n1',
      path: 'markdown_content',
    });
  });

  it('does not turn a status-only result into message content', () => {
    expect(
      resolver.resolveNodeOutputBinding('n1', { success: 'string' }, 'content'),
    ).toBeNull();
  });

  it('rejects ambiguous multi-field structured output for a text input', () => {
    expect(
      resolver.resolveNodeOutputBinding(
        'n1',
        { morning: 'string', noon: 'string', evening: 'string', date: 'string' },
        'content',
      ),
    ).toBeNull();
  });
});
