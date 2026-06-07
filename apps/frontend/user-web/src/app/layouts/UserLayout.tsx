import {
  BellOutlined,
  ExportOutlined,
  BgColorsOutlined,
  MessageOutlined,
  DashboardOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  OrderedListOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { UserChatWidget } from "@/features/chat/components/UserChatWidget";
import { authStore } from "../../adapters/auth/authStore";
import { preferencesStore } from "../../adapters/preferences/preferencesStore";
import "./UserLayout.css";

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

export function UserLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore(authStore, (state) => state.user);
  const language = useStore(preferencesStore, (state) => state.language);
  const setLanguage = useStore(preferencesStore, (state) => state.setLanguage);
  const theme = useStore(preferencesStore, (state) => state.theme);
  const toggleTheme = useStore(preferencesStore, (state) => state.toggleTheme);
  const sidebarCollapsed = useStore(preferencesStore, (state) => state.sidebarCollapsed);
  const toggleSidebar = useStore(preferencesStore, (state) => state.toggleSidebar);
  const setSidebarCollapsed = useStore(preferencesStore, (state) => state.setSidebarCollapsed);
  const selectedMenuKey = location.pathname.startsWith("/executions")
    ? "/executions"
    : location.pathname.startsWith("/published-skills")
      ? "/published-skills"
      : location.pathname.startsWith("/notifications")
        ? "/notifications"
        : location.pathname.startsWith("/chat")
          ? "/chat"
          : location.pathname.startsWith("/reports")
            ? "/reports"
            : location.pathname;

  const languageMenu: MenuProps = {
    items: [
      { key: "zh-CN", label: "简体中文" },
      { key: "en-US", label: "English" },
      { key: "ja-JP", label: "日本語" },
    ],
    onClick: ({ key }) => void setLanguage(key as "zh-CN" | "en-US" | "ja-JP"),
    selectedKeys: [language],
  };

  const userMenu: MenuProps = {
    items: [
      {
        key: "chat",
        icon: <MessageOutlined />,
        label: "打开 AI 对话",
      },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
      },
    ],
    onClick: ({ key }) => {
      if (key === "chat") {
        navigate("/chat");
        return;
      }
      authStore.getState().logout();
    },
  };

  return (
    <Layout className="user-shell">
      <Sider
        className="user-shell-sider"
        collapsible
        collapsed={sidebarCollapsed}
        onCollapse={(collapsed) => setSidebarCollapsed(collapsed)}
        trigger={null}
      >
        <div
          className="user-shell-logo"
          style={{ padding: sidebarCollapsed ? "0 16px" : "0 24px" }}
        >
          <div className="user-shell-logo-inner" style={{ gap: sidebarCollapsed ? 0 : 12 }}>
            <div className="user-shell-logo-mark">U</div>
            {!sidebarCollapsed ? (
              <div className="user-shell-logo-text">User Web</div>
            ) : null}
          </div>
        </div>
        <Menu
          className="user-shell-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
            { key: "/chat", icon: <MessageOutlined />, label: "AI 对话" },
            { key: "/executions", icon: <OrderedListOutlined />, label: "执行列表" },
            { key: "/published-skills", icon: <ThunderboltOutlined />, label: "已发布技能" },
            { key: "/notifications", icon: <BellOutlined />, label: "通知中心" },
            { key: "/reports", icon: <FileTextOutlined />, label: "报告" },
          ]}
        />
      </Sider>
      <Layout
        className="user-shell-main"
        style={{
          marginLeft: sidebarCollapsed ? 80 : 200,
          transition: "margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Header className="user-shell-header">
          <div className="user-shell-header-left">
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
              style={{
                fontSize: 18,
                color: "var(--text-secondary)",
                width: 40,
                height: 40,
                borderRadius: 10,
              }}
            />
            <Space size={8}>
              <Tag color="blue" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                用户工作台
              </Tag>
              <Text type="secondary">统一沿用 portal 的视觉壳，聚焦普通用户主链路。</Text>
            </Space>
          </div>
          <div className="user-shell-header-right">
            <Button
              type="text"
              icon={<BellOutlined />}
              onClick={() => navigate("/notifications")}
              style={{ color: "var(--text-secondary)", borderRadius: 10, height: 36, width: 36 }}
            />
            <Button
              type="text"
              icon={<ExportOutlined />}
              onClick={() => navigate("/chat")}
              style={{ color: "var(--text-secondary)", borderRadius: 10, height: 36, padding: "0 12px" }}
            >
              AI 对话
            </Button>
            <Button
              type="text"
              icon={<BgColorsOutlined />}
              onClick={toggleTheme}
              style={{ color: "var(--text-secondary)", borderRadius: 10, height: 36, padding: "0 12px" }}
            >
              {theme === "light" ? "深色" : "浅色"}
            </Button>
            <Dropdown menu={languageMenu} placement="bottomRight" trigger={["click"]}>
              <Button
                type="text"
                icon={<GlobalOutlined />}
                style={{ color: "var(--text-secondary)", borderRadius: 10, height: 36, padding: "0 12px" }}
              >
                {language === "zh-CN" ? "中文" : language === "en-US" ? "EN" : "日本語"}
              </Button>
            </Dropdown>
            <Dropdown menu={userMenu} placement="bottomRight" trigger={["click"]}>
              <Space className="user-shell-user">
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: "linear-gradient(135deg, #6366f1 0%, #f472b6 100%)" }}
                />
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {user?.username || "未登录"}
                </span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content className="user-shell-content">
          <Outlet />
        </Content>
        <UserChatWidget />
      </Layout>
    </Layout>
  );
}
