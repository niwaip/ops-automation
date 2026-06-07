import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portalRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(portalRoot, "../../..");

const routePolicyPath = path.join(portalRoot, "src/app/router/userRoutePolicy.json");
const portalRouteManifestPath = path.join(portalRoot, "src/app/router/routeManifest.tsx");
const userWebRoutesPath = path.join(workspaceRoot, "apps/frontend/user-web/src/app/router/routes.tsx");

const [policyRaw, portalRouteManifest, userWebRoutes] = await Promise.all([
  readFile(routePolicyPath, "utf8"),
  readFile(portalRouteManifestPath, "utf8"),
  readFile(userWebRoutesPath, "utf8"),
]);

const routePolicy = JSON.parse(policyRaw);

const errors = [];

for (const portalPath of routePolicy.portalInternalWorkbenchRoutes) {
  const keepPattern = new RegExp(`path:\\s*['"]${escapeForRegex(portalPath)}['"][\\s\\S]{0,160}?element:\\s*<(?!(?:UserWebRedirectPage))`);
  if (!keepPattern.test(portalRouteManifest)) {
    errors.push(`portal 必须保留内部工作台链路: ${portalPath}`);
  }
}

for (const redirectRoute of routePolicy.portalRedirectRoutes) {
  const baseRoutePattern = new RegExp(
    `path:\\s*['"]${escapeForRegex(redirectRoute.path)}['"][\\s\\S]{0,200}?renderUserWebRedirect\\(\\s*['"]${escapeForRegex(redirectRoute.path)}['"]\\s*\\)`,
  );
  if (!baseRoutePattern.test(portalRouteManifest)) {
    errors.push(`portal 必须将以下路由收口为 user-web 跳转壳: ${redirectRoute.path}`);
  }
}

for (const userWebPath of routePolicy.userWebRequiredRoutes) {
  const userWebPattern = new RegExp(`path=\\{?['"]${escapeForRegex(userWebPath)}['"]`);
  if (!userWebPattern.test(userWebRoutes)) {
    errors.push(`user-web 缺少必需路由: ${userWebPath}`);
  }
}

if (errors.length > 0) {
  console.error("用户链路收口校验失败：");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("用户链路收口校验通过");

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
