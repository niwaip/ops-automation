import {
  BgColorsOutlined,
  DashboardOutlined,
  GlobalOutlined,
  LogoutOutlined,
  OrderedListOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { authStore } from "../../adapters/auth/authStore";

const { Header, Content, Sider } = Layout;

interface UserLayoutProps {
  children: ReactNode;
}

export function UserLayout({ children }: UserLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore(authStore, (state) => state.user);
  const language = useStore(authStore, (state) => state.language);
  const setLanguage = useStore(authStore, (state) => state.setLanguage);
  const theme = useStore(authStore, (state) => state.theme);
  const toggleTheme = useStore(authStore, (state) => state.toggleTheme);
  const sidebarCollapsed = useStore(authStore, (state) => state.sidebarCollapsed);
  const toggleSidebar = useStore(authStore, (state) => state.toggleSidebar);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={sidebarCollapsed} onCollapse={toggleSidebar} theme="dark">
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
          {sidebarCollapsed ? "U" : "User Web"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname.startsWith("/executions") ? "/executions" : location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
            { key: "/executions", icon: <OrderedListOutlined />, label: "执行列表" },
          ]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "var(--bg-header)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingInline: 20,
            borderBottom: "1px solid var(--bg-secondary)",
          }}
        >
          <Button type="text" onClick={toggleSidebar}>菜单</Button>
          <Space>
            <Button type="text" icon={<BgColorsOutlined />} onClick={toggleTheme}>{theme === "light" ? "深色" : "浅色"}</Button>
            <Button type="text" icon={<GlobalOutlined />} onClick={() => void setLanguage(language === "zh-CN" ? "en-US" : language === "en-US" ? "ja-JP" : "zh-CN")}>
              {language}
            </Button>
            <Typography.Text>{user?.username || "未登录"}</Typography.Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => {
                authStore.getState().logout();
                navigate("/login");
              }}
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
