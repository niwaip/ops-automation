export const getInternalServiceHeaders = (): Record<string, string> => {
  const sharedSecret =
    process.env.INTERNAL_API_SHARED_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    'ops_internal_shared_secret_change_me';

  return {
    'Content-Type': 'application/json',
    'x-internal-auth': sharedSecret,
  };
};
