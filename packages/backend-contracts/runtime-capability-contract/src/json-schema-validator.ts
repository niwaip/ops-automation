// eslint-disable-next-line @typescript-eslint/no-var-requires
let AjvConstructor: any;
try {
  // Try loading Ajv 2020 draft constructor (v8+)
  AjvConstructor = require('ajv/dist/2020');
} catch {
  // Fallback to standard Ajv constructor
  AjvConstructor = require('ajv');
}

export interface SchemaValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    keyword?: string;
    params?: Record<string, unknown>;
  }>;
}

class JsonSchemaValidatorService {
  private inputAjv: any;
  private outputAjv: any;
  private inputValidatorsCache: Map<string, any> = new Map();
  private outputValidatorsCache: Map<string, any> = new Map();

  constructor() {
    // Input validator allows applying default values (useDefaults: true)
    this.inputAjv = new AjvConstructor({
      allErrors: true,
      useDefaults: true,
      coerceTypes: false,
      strict: false,
    });

    // Output validator is STRICT and PURE: ZERO default mutations (useDefaults: false)
    this.outputAjv = new AjvConstructor({
      allErrors: true,
      useDefaults: false,
      coerceTypes: false,
      strict: false,
    });
  }

  /**
   * Validate arbitrary target output data strictly without side effects / default value mutations.
   */
  public validateOutput(data: unknown, schema: Record<string, unknown>): SchemaValidationResult {
    return this.executeValidation(data, schema, this.outputAjv, this.outputValidatorsCache);
  }

  /**
   * Validate input data, allowing input default value population (useDefaults: true).
   */
  public validateInput(data: unknown, schema: Record<string, unknown>): SchemaValidationResult {
    return this.executeValidation(data, schema, this.inputAjv, this.inputValidatorsCache);
  }

  /**
   * Default validation entry point (defaults to strict output validation without side effects).
   */
  public validate(data: unknown, schema: Record<string, unknown>): SchemaValidationResult {
    return this.validateOutput(data, schema);
  }

  private executeValidation(
    data: unknown,
    schema: Record<string, unknown>,
    ajvInstance: any,
    cacheMap: Map<string, any>,
  ): SchemaValidationResult {
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true };
    }

    try {
      const cacheKey = JSON.stringify(schema);
      let validateFn = cacheMap.get(cacheKey);

      if (!validateFn) {
        // Strip or resolve $schema if it contains unhandled meta-schema URIs
        const cleanSchema = { ...schema };
        if (typeof cleanSchema['$schema'] === 'string' && cleanSchema['$schema'].includes('2020-12')) {
          delete cleanSchema['$schema'];
        }
        validateFn = ajvInstance.compile(cleanSchema);
        cacheMap.set(cacheKey, validateFn);
      }

      const valid = Boolean(validateFn(data));
      if (valid) {
        return { valid: true };
      }

      const rawErrors = validateFn.errors || [];
      const errors = rawErrors.map((err: any) => ({
        path: err.instancePath || err.dataPath || '/',
        message: err.message || 'Schema validation error',
        keyword: err.keyword,
        params: err.params as Record<string, unknown>,
      }));

      return {
        valid: false,
        errors,
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [
          {
            path: '/',
            message: `JSON Schema compilation or validation threw error: ${err.message}`,
            keyword: 'compilation',
          },
        ],
      };
    }
  }

  /**
   * Extract data from a runtime result envelope using a simplified JSON path (e.g. '$.result.businessData', '$.data', '$.result').
   */
  public extractDataByPath(envelope: unknown, dataPath?: string): unknown {
    if (!dataPath || dataPath === '$' || dataPath === '$.') {
      return envelope;
    }

    if (envelope === null || typeof envelope !== 'object') {
      return envelope;
    }

    const normalizedPath = dataPath.startsWith('$.')
      ? dataPath.slice(2)
      : dataPath.startsWith('$')
      ? dataPath.slice(1)
      : dataPath;

    if (!normalizedPath) return envelope;

    const segments = normalizedPath.split('.').filter(Boolean);
    let current: any = envelope;

    for (const segment of segments) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = current[segment];
    }

    return current;
  }
}

export const jsonSchemaValidator = new JsonSchemaValidatorService();
