import { PlaywrightCompiler } from '../src/compiler/playwright-to-json';
import { LocatorValidator } from '../src/validators/locator.validator';
import { TemplateValidator } from '../src/validators/template.validator';
import { TemplateJSON, LocatorType } from '../src/types/template.types';

describe('PlaywrightCompiler', () => {
  let compiler: PlaywrightCompiler;
  let locatorValidator: LocatorValidator;
  let templateValidator: TemplateValidator;

  beforeEach(() => {
    locatorValidator = new LocatorValidator();
    templateValidator = new TemplateValidator(locatorValidator);
    compiler = new PlaywrightCompiler(templateValidator);
  });

  describe('compile', () => {
    it('TC01: should compile Playwright script to TemplateJSON', () => {
      const script = `
        // @template-name: Login Test
        page.goto('https://example.com/login');
        page.fill('#username', '{{username}}');
        page.fill('#password', '{{password}}');
        page.click('button[type="submit"]');
        page.waitForTimeout(2000);
      `;

      const result = compiler.compile(script, 'test-user');

      expect(result.template).toBeDefined();
      expect(result.template.name).toBe('Login Test');
      expect(result.template.status).toBe('DRAFT');
      expect(result.template.steps).toBeDefined();
      expect(result.template.steps.length).toBeGreaterThan(0);

      // Check step IDs follow format
      for (const step of result.template.steps) {
        expect(step.step_id).toMatch(/^step_\d+$/);
      }
    });

    it('should parse getByRole actions with role locator', () => {
      const script = `
        page.getByRole('button', {name: 'Submit'}).click();
        page.getByRole('link', {name: 'Download'}).click();
      `;

      const result = compiler.compile(script, 'test-user');

      expect(result.template.steps).toBeDefined();
      const clickSteps = result.template.steps.filter(s => s.action === 'click');
      expect(clickSteps.length).toBe(2);

      // Check locators use 'role' type
      for (const step of clickSteps) {
        expect(step.locator?.type).toBe('role');
      }
    });

    it('should parse getByText actions with text locator', () => {
      const script = `
        page.getByText('Welcome').click();
      `;

      const result = compiler.compile(script, 'test-user');

      expect(result.template.steps[0]?.locator?.type).toBe('text');
      expect(result.template.steps[0]?.locator?.value).toBe('Welcome');
    });

    it('should parse getByTestId actions with test-id locator', () => {
      const script = `
        page.getByTestId('submit-button').click();
      `;

      const result = compiler.compile(script, 'test-user');

      expect(result.template.steps[0]?.locator?.type).toBe('test-id');
      expect(result.template.steps[0]?.locator?.value).toBe('submit-button');
    });

    it('should extract params from {{param}} placeholders', () => {
      const script = `
        page.fill('#input', '{{username}}');
        page.fill('#other', '{{email}}');
      `;

      const result = compiler.compile(script, 'test-user');

      expect(result.template.params_schema.properties.username).toBeDefined();
      expect(result.template.params_schema.properties.email).toBeDefined();
      expect(result.template.params_schema.required).toContain('username');
      expect(result.template.params_schema.required).toContain('email');
    });

    it('should throw error for empty script', () => {
      expect(() => compiler.compile('', 'test-user')).toThrow('Script cannot be empty');
    });

    it('should throw error for script with no valid actions', () => {
      expect(() => compiler.compile('// just comments', 'test-user')).toThrow('No valid actions found in script');
    });
  });
});

describe('LocatorValidator', () => {
  let validator: LocatorValidator;

  beforeEach(() => {
    validator = new LocatorValidator();
  });

  describe('validateLocator', () => {
    it('TC02: should return warning for xpath locator', () => {
      const locator = { type: 'xpath' as LocatorType, value: '//button[@id="submit"]' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('xpath');
      expect(result.warnings[0]).toContain('discouraged');
    });

    it('should return warning for css locator', () => {
      const locator = { type: 'css' as LocatorType, value: '#submit-button' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('css');
    });

    it('should not return warning for role locator', () => {
      const locator = { type: 'role' as LocatorType, value: 'button' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should not return warning for text locator', () => {
      const locator = { type: 'text' as LocatorType, value: 'Submit' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should not return warning for test-id locator', () => {
      const locator = { type: 'test-id' as LocatorType, value: 'submit-btn' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should return error for invalid locator type', () => {
      const locator = { type: 'invalid' as LocatorType, value: 'something' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid locator type');
    });

    it('should return error for empty locator value', () => {
      const locator = { type: 'role' as LocatorType, value: '' };
      const result = validator.validateLocator(locator);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('empty');
    });
  });

  describe('isLocatorCompliant', () => {
    it('should return true for role locator', () => {
      expect(validator.isLocatorCompliant({ type: 'role' as LocatorType, value: 'btn' })).toBe(true);
    });

    it('should return true for text locator', () => {
      expect(validator.isLocatorCompliant({ type: 'text' as LocatorType, value: 'text' })).toBe(true);
    });

    it('should return true for test-id locator', () => {
      expect(validator.isLocatorCompliant({ type: 'test-id' as LocatorType, value: 'id' })).toBe(true);
    });

    it('should return false for css locator', () => {
      expect(validator.isLocatorCompliant({ type: 'css' as LocatorType, value: '#btn' })).toBe(false);
    });

    it('should return false for xpath locator', () => {
      expect(validator.isLocatorCompliant({ type: 'xpath' as LocatorType, value: '//btn' })).toBe(false);
    });
  });
});

describe('TemplateValidator', () => {
  let validator: TemplateValidator;
  let locatorValidator: LocatorValidator;

  beforeEach(() => {
    locatorValidator = new LocatorValidator();
    validator = new TemplateValidator(locatorValidator);
  });

  const createValidTemplate = (): TemplateJSON => ({
    id: 'test-id',
    name: 'Test Template',
    version: '1.0.0',
    status: 'DRAFT',
    params_schema: { type: 'object', properties: {}, required: [] },
    steps: [
      { step_id: 'step_1', action: 'click', locator: { type: 'role' as LocatorType, value: 'button' } },
    ],
    metadata: {
      created_by: 'test-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  describe('validate', () => {
    it('TC03: should return error for password parameter', () => {
      const template = createValidTemplate();
      template.params_schema = {
        type: 'object',
        properties: {
          password: { type: 'string' },
        },
        required: ['password'],
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('password') || e.includes('Forbidden'))).toBe(true);
    });

    it('should return error for passwd parameter', () => {
      const template = createValidTemplate();
      template.params_schema = {
        type: 'object',
        properties: {
          passwd: { type: 'string' },
        },
        required: [],
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('passwd'))).toBe(true);
    });

    it('should return error for api_key parameter', () => {
      const template = createValidTemplate();
      template.params_schema = {
        type: 'object',
        properties: {
          api_key: { type: 'string' },
        },
        required: [],
      };

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('api_key'))).toBe(true);
    });

    it('should validate step_id format', () => {
      const template = createValidTemplate();
      template.steps = [
        { step_id: 'invalid-step-id', action: 'click', locator: { type: 'role' as LocatorType, value: 'button' } },
      ];

      const result = validator.validate(template);

      expect(result.errors.some(e => e.includes('Step ID') && e.includes('format'))).toBe(true);
    });

    it('should detect duplicate step IDs', () => {
      const template = createValidTemplate();
      template.steps = [
        { step_id: 'step_1', action: 'click', locator: { type: 'role' as LocatorType, value: 'button' } },
        { step_id: 'step_1', action: 'fill', locator: { type: 'text' as LocatorType, value: 'input' } },
      ];

      const result = validator.validate(template);

      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should return warning for empty steps', () => {
      const template = createValidTemplate();
      template.steps = [];

      const result = validator.validate(template);

      expect(result.warnings.some(w => w.includes('no steps'))).toBe(true);
    });

    it('should return error for PUBLISHED template with no steps', () => {
      const template = createValidTemplate();
      template.status = 'PUBLISHED';
      template.steps = [];

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PUBLISHED') && e.includes('step'))).toBe(true);
    });

    it('should validate required fields', () => {
      const template = createValidTemplate();
      template.name = '';

      const result = validator.validate(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name') && e.includes('required'))).toBe(true);
    });

    it('should pass for valid template', () => {
      const template = createValidTemplate();

      const result = validator.validate(template);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});