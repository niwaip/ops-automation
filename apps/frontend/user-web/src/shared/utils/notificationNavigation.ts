export const resolveNotificationActionPath = (
  actionUrl: string,
  source: string,
  sourceId: string
): string => {
  if (source === 'execution') {
    return `/executions/${sourceId}`;
  }
  if (source === 'report') {
    return `/reports/${sourceId}`;
  }
  if (source === 'coordination') {
    return actionUrl || '/dashboard?tab=inbox';
  }
  return actionUrl;
};
