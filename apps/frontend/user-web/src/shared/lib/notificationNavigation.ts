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
  return actionUrl;
};
