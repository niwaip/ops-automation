import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const userWebRoot = path.resolve(__dirname, "..");

const files = {
  routes: path.join(userWebRoot, "src/app/router/routes.tsx"),
  runtimeEffects: path.join(userWebRoot, "src/app/UserRuntimeEffects.tsx"),
  loginPage: path.join(userWebRoot, "src/features/auth/pages/LoginPage.tsx"),
  chatPage: path.join(userWebRoot, "src/features/chat/pages/ChatPage.tsx"),
  reportListPage: path.join(userWebRoot, "src/features/reports/pages/ReportListPage.tsx"),
  reportDetailPage: path.join(userWebRoot, "src/features/reports/pages/ReportDetailPage.tsx"),
  notificationsPage: path.join(userWebRoot, "src/features/notifications/pages/NotificationsPage.tsx"),
};

const [
  routes,
  runtimeEffects,
  loginPage,
  chatPage,
  reportListPage,
  reportDetailPage,
  notificationsPage,
] = await Promise.all(Object.values(files).map((filePath) => readFile(filePath, "utf8")));

const checks = [
  {
    name: "登录路由保留",
    ok: includesAll(routes, [
      'path="/login"',
      'path="/chat"',
      'path="/executions"',
      'path="/executions/new"',
      'path="/executions/:id"',
      'path="/notifications"',
      'path="/reports"',
      'path="/reports/:id"',
    ]),
  },
  {
    name: "登录页存在可用入口",
    ok: includesAll(loginPage, ["export function LoginPage", "authApi.login"]),
  },
  {
    name: "聊天页保留会话与流式主链路",
    ok: includesAll(chatPage, [
      "chatApi.listSessions()",
      "chatApi.getChatHistory(selectedSessionId!)",
      "chatApi.stream(",
      "executionApi.submitInput(",
      "executionApi.approve(",
      "executionApi.reject(",
    ]),
  },
  {
    name: "报告列表保留查询入口",
    ok: includesAll(reportListPage, [
      "reportApi.getReports()",
      "reportApi.getReportDownloadInfo(report.id)",
    ]),
  },
  {
    name: "报告详情保留状态轮询与下载入口",
    ok: includesAll(reportDetailPage, [
      "reportApi.getReport(id!)",
      "reportApi.getReportStatus(id!)",
      "resolveApiUrl(`/reports/${report.id}/download`)",
    ]),
  },
  {
    name: "通知页保留通知列表展示",
    ok: includesAll(notificationsPage, [
      'invalidateQueries(["user-web-notifications"])',
      "buildNotificationContent(item, language)",
      "useNotificationStore((state) => state.items)",
    ]),
  },
  {
    name: "运行时接线保留通知拉取与 socket 生命周期",
    ok: includesAll(runtimeEffects, [
      "notificationApi.list({ limit: 100 })",
      "runtimeSocket.subscribe(",
      "runtimeSocket.connect()",
      "runtimeSocket.disconnect()",
      "resetNotifications()",
    ]),
  },
];

const failures = checks.filter((check) => !check.ok);

if (failures.length > 0) {
  console.error("Sprint 5 静态回归校验失败：");
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log("Sprint 5 静态回归校验通过");

function includesAll(source, snippets) {
  return snippets.every((snippet) => source.includes(snippet));
}
