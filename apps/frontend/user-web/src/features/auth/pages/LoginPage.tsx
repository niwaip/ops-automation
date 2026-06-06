import { Button, Card, Space, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { authStore } from "../../../adapters/auth/authStore";
import { authApi } from "../../../api";

export function LoginPage() {
  const navigate = useNavigate();
  const theme = useStore(authStore, (state) => state.theme);
  const isDark = theme === "dark";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? "linear-gradient(135deg, #020617 0%, #0f172a 45%, #312e81 100%)"
          : "linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #818cf8 100%)",
      }}
    >
      <Card style={{ width: 420, borderRadius: 18 }}>
        <Typography.Title level={3}>User Web 登录</Typography.Title>
        <Typography.Paragraph type="secondary">
          用户侧 Web 壳已独立，可直接消费共享核心层能力。
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button
            type="primary"
            block
            onClick={async () => {
              const response = await authApi.login({ username: "admin", password: "admin123" });
              authStore.getState().login(response.accessToken, response.refreshToken, response.user);
              navigate("/executions");
            }}
          >
            使用默认账号登录
          </Button>
          <Typography.Text type="secondary">如需自定义登录表单，可在此基础上继续扩展。</Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
