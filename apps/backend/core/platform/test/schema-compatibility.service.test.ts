import { SchemaCompatibilityService } from '../../../registry-release/release-manager/src/validator/schema-compatibility.service';

describe('SchemaCompatibilityService (§15.4 item 5)', () => {
  const service = new SchemaCompatibilityService();

  const schema = (props: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    type: 'object',
    additionalProperties: true,
    properties: props,
    ...over,
  });

  describe('compareOutputSchemas (backward mode)', () => {
    it('treats a first publish (no old schema) as compatible', () => {
      const result = service.compareOutputSchemas(null, schema({ x: { type: 'string' } }));
      expect(result.compatible).toBe(true);
      expect(result.classification).toBe('first_publish');
    });

    it('treats identical schemas as identical and compatible', () => {
      const oldS = schema({ x: { type: 'string' } });
      const result = service.compareOutputSchemas(oldS, { ...oldS });
      expect(result.compatible).toBe(true);
      expect(result.classification).toBe('identical');
      expect(result.changes).toHaveLength(0);
    });

    it('allows adding an optional property to an open schema', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' } }),
        schema({ x: { type: 'string' }, y: { type: 'number' } })
      );
      expect(result.compatible).toBe(true);
      expect(result.classification).toBe('compatible');
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'property_added', path: '#.y', breaking: false })
      );
    });

    it('blocks adding a property when the old schema was closed (additionalProperties: false)', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' } }, { additionalProperties: false }),
        schema({ x: { type: 'string' }, y: { type: 'number' } }, { additionalProperties: false })
      );
      expect(result.compatible).toBe(false);
      expect(result.classification).toBe('breaking');
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'property_added_strict', path: '#.y', breaking: true })
      );
    });

    it('blocks removing a property', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' }, y: { type: 'number' } }),
        schema({ x: { type: 'string' } })
      );
      expect(result.compatible).toBe(false);
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'property_removed', path: '#.y', breaking: true })
      );
    });

    it('blocks type changes', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' } }),
        schema({ x: { type: 'number' } })
      );
      expect(result.compatible).toBe(false);
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'type_changed', path: '#.x', breaking: true })
      );
    });

    it('blocks newly-required fields but allows dropping required', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' } }, { required: [] }),
        schema({ x: { type: 'string' } }, { required: ['x'] })
      );
      expect(result.compatible).toBe(false);
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'required_added', path: '#.x', breaking: true })
      );

      const loosened = service.compareOutputSchemas(
        schema({ x: { type: 'string' } }, { required: ['x'] }),
        schema({ x: { type: 'string' } }, { required: [] })
      );
      expect(loosened.compatible).toBe(true);
      expect(loosened.changes).toContainEqual(
        expect.objectContaining({ kind: 'required_removed', breaking: false })
      );
    });

    it('blocks removing enum values but allows adding them', () => {
      const oldS = schema({ status: { type: 'string', enum: ['a', 'b'] } });
      const removed = service.compareOutputSchemas(
        oldS,
        schema({ status: { type: 'string', enum: ['a'] } })
      );
      expect(removed.compatible).toBe(false);
      expect(removed.changes).toContainEqual(
        expect.objectContaining({ kind: 'enum_value_removed', breaking: true })
      );

      const added = service.compareOutputSchemas(
        oldS,
        schema({ status: { type: 'string', enum: ['a', 'b', 'c'] } })
      );
      expect(added.compatible).toBe(true);
      expect(added.changes).toContainEqual(
        expect.objectContaining({ kind: 'enum_value_added', breaking: false })
      );
    });

    it('blocks tightened constraints but allows loosened ones', () => {
      const oldS = schema({ title: { type: 'string', maxLength: 100 } });
      const tightened = service.compareOutputSchemas(
        oldS,
        schema({ title: { type: 'string', maxLength: 50 } })
      );
      expect(tightened.compatible).toBe(false);
      expect(tightened.changes).toContainEqual(
        expect.objectContaining({ kind: 'constraint_tightened', breaking: true })
      );

      const loosened = service.compareOutputSchemas(
        oldS,
        schema({ title: { type: 'string', maxLength: 200 } })
      );
      expect(loosened.compatible).toBe(true);
      expect(loosened.changes).toContainEqual(
        expect.objectContaining({ kind: 'constraint_loosened', breaking: false })
      );
    });

    it('detects breaking changes inside nested objects', () => {
      const oldS = schema({ meta: { type: 'object', properties: { a: { type: 'number' } } } });
      const result = service.compareOutputSchemas(
        oldS,
        schema({ meta: { type: 'object', properties: { a: { type: 'string' } } } })
      );
      expect(result.compatible).toBe(false);
      expect(result.changes).toContainEqual(
        expect.objectContaining({ kind: 'type_changed', path: '#.meta.a', breaking: true })
      );
    });
  });

  describe('mode: none (contractCompatibility opt-out)', () => {
    it('never blocks regardless of the diff', () => {
      const result = service.compareOutputSchemas(
        schema({ x: { type: 'string' }, y: { type: 'string' } }),
        schema({ x: { type: 'number' } }),
        'none'
      );
      expect(result.compatible).toBe(true);
      expect(result.classification).toBe('unknown');
      expect(result.changes).toHaveLength(0);
    });

    it('resolves mode from manifest spec.migration.contractCompatibility', () => {
      expect(
        service.resolveCompatibility({ manifest: { spec: { migration: { contractCompatibility: 'none' } } } })
      ).toBe('none');
      expect(service.resolveCompatibility({ manifest: { spec: { migration: {} } } })).toBe('backward');
      expect(service.resolveCompatibility({})).toBe('backward');
      expect(service.resolveCompatibility(null)).toBe('backward');
    });
  });

  describe('extractOutputSchema', () => {
    it('resolves contracts.output.schema first', () => {
      const payload = {
        contracts: { output: { schema: { type: 'object', properties: { a: { type: 'string' } } } } },
        outputSchema: { type: 'object', properties: { wrong: { type: 'string' } } },
      };
      expect(service.extractOutputSchema(payload)).toEqual(
        expect.objectContaining({ properties: { a: { type: 'string' } } })
      );
    });

    it('falls back to manifest.spec.contracts.output.schema and top-level outputSchema', () => {
      expect(
        service.extractOutputSchema({
          manifest: { spec: { contracts: { output: { schema: { type: 'object' } } } } },
        })
      ).toEqual({ type: 'object' });
      expect(service.extractOutputSchema({ outputSchema: { type: 'object' } })).toEqual({ type: 'object' });
      expect(service.extractOutputSchema({})).toBeNull();
      expect(service.extractOutputSchema(null)).toBeNull();
    });
  });
});
