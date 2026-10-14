import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutionRequiredInputField from './ExecutionRequiredInputField';

describe('ExecutionRequiredInputField controlled component', () => {
  it('renders input with value for string field', () => {
    const html = renderToStaticMarkup(
      <ExecutionRequiredInputField
        field={{
          name: 'party_a',
          type: 'string',
          required: true,
          missing: true,
          source: 'user_input',
        }}
        value="甲方公司法定全称"
      />
    );

    expect(html).toContain('value="甲方公司法定全称"');
  });

  it('renders input with number value for integer field', () => {
    const html = renderToStaticMarkup(
      <ExecutionRequiredInputField
        field={{
          name: 'sign_year',
          type: 'number',
          required: true,
          missing: true,
          source: 'user_input',
        }}
        value={2026}
      />
    );

    expect(html).toContain('value="2026"');
  });

  it('renders textarea with json object value', () => {
    const html = renderToStaticMarkup(
      <ExecutionRequiredInputField
        field={{
          name: 'payload',
          type: 'object',
          required: true,
          missing: true,
          source: 'user_input',
        }}
        value={{ key: 'value' }}
      />
    );

    expect(html).toContain('key');
    expect(html).toContain('value');
  });

  it('renders switch with checked state for boolean field', () => {
    const html = renderToStaticMarkup(
      <ExecutionRequiredInputField
        field={{
          name: 'agree',
          type: 'boolean',
          required: true,
          missing: true,
          source: 'user_input',
        }}
        value={true}
      />
    );

    expect(html).toContain('ant-switch-checked');
  });
});
