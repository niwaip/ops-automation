import { BuiltinHandlerRegistryService } from '../src/modules/execution/adapters/builtin-handler-registry.service';

describe('BuiltinHandlerRegistryService capability aliases', () => {
  it('resolves document handlers by both runtime handler key and capability key', () => {
    const registry = new BuiltinHandlerRegistryService();
    registry.onModuleInit();

    expect(registry.getHandler('platform.document.pdf-create')).toBe(
      registry.getHandler('document.pdf.create')
    );
    expect(registry.getHandler('platform.document.pdf-merge')).toBe(
      registry.getHandler('document.pdf.merge')
    );
    expect(registry.getHandler('platform.document.pdf-split')).toBe(
      registry.getHandler('document.pdf.split')
    );
    expect(registry.getHandler('platform.search.web')).toBe(registry.getHandler('search.web'));
    expect(registry.getHandler('tavily_search')).toBe(registry.getHandler('search.web'));
  });
});
