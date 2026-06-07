import { useEffect, useMemo } from 'react';
import { Button, Result, Spin } from 'antd';
import { useLocation } from 'react-router-dom';
import { buildUserWebUrl } from '@/shared/config/runtime';

interface UserWebRedirectPageProps {
  targetPath?: string;
}

const resolveTargetUrl = (
  pathname: string,
  search: string,
  hash: string,
  targetPath?: string,
) => {
  const basePath = targetPath ?? pathname;
  return `${buildUserWebUrl(basePath)}${search}${hash}`;
};

const UserWebRedirectPage: React.FC<UserWebRedirectPageProps> = ({ targetPath }) => {
  const location = useLocation();
  const targetUrl = useMemo(
    () => resolveTargetUrl(location.pathname, location.search, location.hash, targetPath),
    [location.hash, location.pathname, location.search, targetPath],
  );

  useEffect(() => {
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <Result
      status="info"
      title="正在跳转到用户入口"
      subTitle="当前页面已迁移到 user-web，若未自动跳转，可手动打开。"
      extra={[
        <Button key="open" type="primary" href={targetUrl}>
          打开 user-web
        </Button>,
      ]}
      icon={<Spin size="large" />}
    />
  );
};

export default UserWebRedirectPage;
