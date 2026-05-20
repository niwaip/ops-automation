import type { TFunction } from 'i18next';
import type { MenuProps } from 'antd';
import { getDefaultOpenKeys, portalNavigationEntries, resolveActiveMenuKey } from '@/app/router/routeManifest';

const resolveLabel = (
  t: TFunction<'common'>,
  item: { labelKey?: string; label?: string },
) => item.labelKey ? t(item.labelKey) : item.label || '';

export const buildNavigationMenuItems = (
  t: TFunction<'common'>,
  userRole?: string,
): MenuProps['items'] => {
  const rootEntries = portalNavigationEntries.filter((entry) => entry.nav?.group === 'root');
  const adminEntry = portalNavigationEntries.find((entry) => entry.nav?.key === '/admin');

  const rootItems = rootEntries
    .filter((entry) => !entry.nav?.requiresAdmin || userRole === 'admin')
    .map((entry) => ({
      key: entry.nav!.key,
      icon: entry.nav!.icon,
      label: resolveLabel(t, entry.nav!),
    }));

  if (!adminEntry || userRole !== 'admin' || !adminEntry.nav?.children?.length) {
    return rootItems;
  }

  return [
    ...rootItems,
    {
      key: adminEntry.nav.key,
      icon: adminEntry.nav.icon,
      label: resolveLabel(t, adminEntry.nav),
      children: adminEntry.nav.children.map((child) => ({
        key: child.key,
        icon: child.icon,
        label: resolveLabel(t, child),
      })),
    },
  ];
};

export const getSelectedNavigationKey = (pathname: string) => resolveActiveMenuKey(pathname);
export const getDefaultNavigationOpenKeys = (pathname: string) => getDefaultOpenKeys(pathname);
