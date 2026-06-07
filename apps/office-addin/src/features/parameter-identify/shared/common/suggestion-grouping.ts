import type { AISuggestion } from '../../../../app/store';

function getWordGroupSortNumber(groupName: string): number {
  const match = groupName.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

export function getSuggestionGroupName(
  suggestion: AISuggestion,
  hostKind: 'word' | 'excel'
): string {
  if (hostKind === 'excel') {
    return suggestion.details?.excelAnchor?.sheetName
      || suggestion.details?.chapter
      || '未归属 Sheet';
  }

  return suggestion.details?.chapter || '默认分组';
}

export function groupSuggestionsByHost(
  suggestions: AISuggestion[],
  hostKind: 'word' | 'excel'
): Record<string, AISuggestion[]> {
  const grouped: Record<string, AISuggestion[]> = {};

  for (const suggestion of suggestions) {
    const groupName = getSuggestionGroupName(suggestion, hostKind);
    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }
    grouped[groupName].push(suggestion);
  }

  const sortedKeys = Object.keys(grouped).sort((left, right) => {
    if (hostKind === 'excel') {
      return left.localeCompare(right, 'zh-Hans-CN');
    }

    const leftNumber = getWordGroupSortNumber(left);
    const rightNumber = getWordGroupSortNumber(right);
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right, 'zh-Hans-CN');
  });

  return sortedKeys.reduce<Record<string, AISuggestion[]>>((result, key) => {
    result[key] = grouped[key];
    return result;
  }, {});
}

export function getSuggestionGroupIcon(groupName: string, hostKind: 'word' | 'excel'): string {
  if (hostKind === 'excel') {
    return '📊';
  }

  return /\d+/.test(groupName) ? '📝' : '📑';
}
