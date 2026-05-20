import { useQuery } from 'react-query';
import { useAuthStore } from '@/shared/store/authStore';
import { authApi } from '@/api/auth';

export const useMe = () => {
  const { isAuthenticated, setUser, logout } = useAuthStore();

  return useQuery(
    ['me'],
    () => authApi.me(),
    {
      enabled: isAuthenticated,
      onSuccess: (data) => {
        setUser(data.user);
      },
      onError: () => {
        logout();
      },
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  );
};
