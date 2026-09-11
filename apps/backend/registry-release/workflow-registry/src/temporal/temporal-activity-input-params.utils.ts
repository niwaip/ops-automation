export const normalizeInputParams = (
  inputParams:
    | Array<{ key?: string; value?: string; required?: boolean }>
    | Record<string, string>
    | undefined
): Array<{ key: string; value: string; required: boolean }> => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item) => ({
      key: item.key || '',
      value: item.value || '',
      required: Boolean(item.required),
    }));
  }
  return Object.entries(inputParams).map(([key, value]) => ({
    key,
    value: value || '',
    required: !value,
  }));
};
