import { OfficeAppType } from '../../app/store';

export function getOfficeType(): OfficeAppType {
  switch (Office.context?.host) {
    case Office.HostType.Word:
      return 'word';
    case Office.HostType.Excel:
      return 'excel';
    case Office.HostType.PowerPoint:
      return 'ppt';
  }
  if (typeof Word !== 'undefined') return 'word';
  if (typeof Excel !== 'undefined') return 'excel';
  if (typeof PowerPoint !== 'undefined') return 'ppt';
  return 'word'; // 默认
}
