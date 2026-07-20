import { useEffect } from 'react';
import { App } from 'antd';
import { useMutation } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { FormInstance } from 'antd';
import { browserStorage } from '../../../adapters/storage/browserStorage';
import { authSessionPort, authStore } from '../../../adapters/auth/authStore';
import { authApi } from '../../../api';

const REMEMBERED_USERNAME_KEY = 'user-web-remembered-username';

export interface LoginFormValues {
  username: string;
  password: string;
  remember?: boolean;
}

interface UseLoginFormOptions {
  /** SSO 回调进行中时禁用登录按钮 */
  ssoPending: boolean;
  /** 外部传入的 antd Form 实例（PasswordLoginForm 也使用） */
  form: FormInstance<LoginFormValues>;
}

/**
 * 登录表单状态 + 提交逻辑。
 *
 * "记住我" 仅持久化用户名（出于安全考虑不缓存密码）。
 * 首次挂载时若已保存用户名，自动填入 username 字段并勾选 remember。
 */
export function useLoginForm({ ssoPending, form }: UseLoginFormOptions) {
  const { message } = App.useApp();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const savedUsername = browserStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (!savedUsername) {
        return;
      }
      form.setFieldsValue({ username: savedUsername, remember: true });
    } catch {
      // Ignore invalid cached username.
    }
  }, [form]);

  const loginMutation = useMutation(authApi.login, {
    onSuccess: (response) => {
      authStore.getState().login(response.accessToken, response.refreshToken, response.user);
      void message.success('登录成功');
      navigate('/dashboard');
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : '登录失败');
    },
  });

  const handleSubmit = (values: LoginFormValues) => {
    if (values.remember) {
      browserStorage.setItem(REMEMBERED_USERNAME_KEY, values.username);
    } else {
      browserStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }
    loginMutation.mutate({ username: values.username, password: values.password });
  };

  return {
    loginMutation,
    ssoPending,
    handleSubmit,
    initiateSso: () => authSessionPort.initiateLogin?.(),
  };
}
