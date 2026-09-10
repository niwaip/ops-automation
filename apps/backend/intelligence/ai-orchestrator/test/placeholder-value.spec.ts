import { isPlaceholderTextValue } from '../src/common/placeholder-value';

describe('isPlaceholderTextValue', () => {
  it('returns true for common placeholder strings', () => {
    expect(isPlaceholderTextValue('n/a')).toBe(true);
    expect(isPlaceholderTextValue('N/A')).toBe(true);
    expect(isPlaceholderTextValue('待补充')).toBe(true);
    expect(isPlaceholderTextValue('未提供')).toBe(true);
    expect(isPlaceholderTextValue('none')).toBe(true);
    expect(isPlaceholderTextValue('null')).toBe(true);
  });

  it('returns true for masked password representations', () => {
    expect(isPlaceholderTextValue('••••••••')).toBe(true);
    expect(isPlaceholderTextValue('••••••')).toBe(true);
    expect(isPlaceholderTextValue('********')).toBe(true);
    expect(isPlaceholderTextValue('***')).toBe(true);
    expect(isPlaceholderTextValue('●●●●●●')).toBe(true);
    expect(isPlaceholderTextValue('[redacted]')).toBe(true);
    expect(isPlaceholderTextValue('redacted')).toBe(true);
    expect(isPlaceholderTextValue('[masked]')).toBe(true);
  });

  it('returns false for actual valid input values', () => {
    expect(isPlaceholderTextValue('admin123')).toBe(false);
    expect(isPlaceholderTextValue('上海的天气')).toBe(false);
    expect(isPlaceholderTextValue('password123')).toBe(false);
    expect(isPlaceholderTextValue('http://192.168.100.143:5174')).toBe(false);
  });
});
