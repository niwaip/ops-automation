/**
 * Office Add-in 向导页面路由
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import {
  DEFAULT_OFFICE_ADDIN_API_BASE_URL,
  DEFAULT_OFFICE_ADDIN_BASE_URL,
} from './config/defaults';

type MiddlewareNext = (err?: unknown) => void;

const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true';
const certsPath = isDocker
  ? '/app/certs'
  : path.resolve(process.cwd(), '../../../docker/office-addin/certs');
const publicPath = path.resolve(process.cwd(), 'public');
const manifestFiles = new Set([
  'manifest-word.xml',
  'manifest-excel.xml',
  'manifest-ppt.xml',
  'manifest-word-simple.xml',
  'manifest-test.xml',
]);

export function wizardPagePlugin() {
  return {
    name: 'wizard-page',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((
        req: IncomingMessage & { url?: string },
        res: ServerResponse,
        next: MiddlewareNext,
      ) => {
        const url = req.url || '';

        if (url === '/taskpane.html' || url === '/taskpane') {
          req.url = '/index.html';
          next();
          return;
        }

        const manifestName = url.replace(/^\//, '');
        if (manifestFiles.has(manifestName)) {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(renderManifest(manifestName));
          return;
        }

        if (url === '/server.crt') {
          res.setHeader('Content-Type', 'application/x-x509-ca-cert');
          res.setHeader('Content-Disposition', 'attachment; filename="server.crt"');
          res.end(fs.readFileSync(path.join(certsPath, 'server.crt')));
          return;
        }

        if (url === '/download' || url === '/download.html') {
          res.statusCode = 302;
          res.setHeader('Location', '/wizard');
          res.end();
          return;
        }

        if (url === '/wizard' || url === '/wizard.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getWizardPageHtml());
          return;
        }

        next();
      });
    }
  };
}

function renderManifest(manifestName: string): string {
  const addinBaseUrl = process.env.VITE_ADDIN_BASE_URL || DEFAULT_OFFICE_ADDIN_BASE_URL;
  const templatePath = path.join(publicPath, manifestName);
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.split(DEFAULT_OFFICE_ADDIN_BASE_URL).join(addinBaseUrl);
}

function getWizardPageHtml(): string {
  const addinBaseUrl = process.env.VITE_ADDIN_BASE_URL || DEFAULT_OFFICE_ADDIN_BASE_URL;
  const apiBaseUrl = process.env.VITE_API_URL || DEFAULT_OFFICE_ADDIN_API_BASE_URL;
  const addinHostname = safeGetHostname(addinBaseUrl);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carbone Office Add-in 向导</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 36px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
    }
    h1 { color: #4A90D9; font-size: 32px; margin-bottom: 10px; }
    .subtitle { color: #666; font-size: 18px; margin-bottom: 24px; }
    .hero-box {
      background: #f0f7ff;
      border: 2px solid #4A90D9;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .hero-box p {
      color: #555;
      line-height: 1.7;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #4A90D9;
      color: white;
      font-size: 16px;
      padding: 14px 22px;
      border-radius: 8px;
      text-decoration: none;
      margin-top: 16px;
      transition: all 0.3s;
    }
    .download-btn:hover {
      background: #357ABD;
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(74, 144, 217, 0.35);
    }
    .section {
      margin-top: 20px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 10px;
    }
    .section h2 { color: #333; margin-bottom: 15px; font-size: 20px; }
    .step {
      position: relative;
      padding: 16px 18px 16px 56px;
      margin: 10px 0;
      background: white;
      border-radius: 8px;
      border-left: 4px solid #4A90D9;
      line-height: 1.7;
    }
    .step::before {
      content: attr(data-step);
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      background: #4A90D9;
      color: white;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      text-align: center;
      line-height: 26px;
      font-weight: 700;
      font-size: 13px;
    }
    .code {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 14px;
      border-radius: 8px;
      font-family: 'Consolas', monospace;
      white-space: pre-wrap;
      overflow-x: auto;
      margin: 10px 0;
    }
    .checks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .check-item {
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
    }
    .check-title { font-weight: 600; margin-bottom: 8px; color: #333; }
    .check-value { font-family: monospace; font-size: 13px; color: #333; word-break: break-all; }
    .badge {
      display: inline-block;
      margin-top: 8px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      color: #fff;
      background: #6c757d;
    }
    .badge.ok { background: #28a745; }
    .badge.fail { background: #dc3545; }
    .menu-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .menu-item {
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      line-height: 1.6;
    }
    .menu-item strong {
      display: block;
      color: #4A90D9;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Carbone Office Add-in 向导</h1>
    <p class="subtitle">按步骤完成脚本下载、执行和菜单操作</p>

    <div class="hero-box">
      <p>统一脚本会自动下载当前运行实例对应的证书和 manifest，并处理证书安装、Word/Excel/PowerPoint 安装以及深度诊断。</p>
      <a class="download-btn" href="/office-addin-wizard.ps1" download>1. 下载 office-addin-wizard.ps1</a>
    </div>

    <div class="section">
      <h2>步骤 1：下载脚本</h2>
      <div class="step" data-step="1">点击上方按钮下载 <code>office-addin-wizard.ps1</code>，建议保存到 Windows 本地目录，例如 <code>C:\\OfficeAddins</code>。</div>
    </div>

    <div class="section">
      <h2>步骤 2：执行脚本</h2>
      <div class="step" data-step="2">使用管理员 PowerShell 进入脚本所在目录后执行下面命令。</div>
      <div class="code">powershell -ExecutionPolicy Bypass -File .\\office-addin-wizard.ps1 -HostName ${escapeHtml(addinHostname)}</div>
    </div>

    <div class="section">
      <h2>步骤 3：菜单</h2>
      <div class="menu-list">
        <div class="menu-item"><strong>1. 证书安装</strong>导入当前服务的证书。</div>
        <div class="menu-item"><strong>2. 证书状态确认</strong>检查 HTTPS、SAN、证书存储。</div>
        <div class="menu-item"><strong>3. 安装 Word</strong>安装并注册 Word 加载项。</div>
        <div class="menu-item"><strong>4. 安装 Excel</strong>安装并注册 Excel 加载项。</div>
        <div class="menu-item"><strong>5. 安装 PowerPoint</strong>安装并注册 PPT 加载项。</div>
        <div class="menu-item"><strong>6. 深度解析</strong>做完整本地排查。</div>
      </div>
    </div>

    <div class="section">
      <h2>环境自检与服务地址</h2>
      <div class="checks">
        <div class="check-item">
          <div class="check-title">Add-in</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}</div>
          <span class="badge" id="check-addin-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">Carbone API</div>
          <div class="check-value">${escapeHtml(apiBaseUrl)}</div>
          <span class="badge" id="check-api-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">Manifest Host</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}/manifest-word.xml</div>
          <span class="badge" id="check-manifest-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">Wizard</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}/wizard</div>
          <span class="badge ok">当前页面</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    (async function runChecks() {
      const addinBaseUrl = ${JSON.stringify(addinBaseUrl)};
      const apiBaseUrl = ${JSON.stringify(apiBaseUrl)};

      const setBadge = (id, ok, text) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.classList.remove('ok', 'fail');
        el.classList.add(ok ? 'ok' : 'fail');
      };

      const checkJson = async (url, badgeId, successText, failText) => {
        try {
          const res = await fetch(url, { method: 'GET', mode: 'cors' });
          if (!res.ok) {
            setBadge(badgeId, false, failText + ' (HTTP ' + res.status + ')');
            return false;
          }
          setBadge(badgeId, true, successText);
          return true;
        } catch (_err) {
          setBadge(badgeId, false, failText);
          return false;
        }
      };

      await checkJson(addinBaseUrl + '/health', 'check-addin-badge', '可访问', '不可访问');
      await checkJson(apiBaseUrl + '/health', 'check-api-badge', '可访问', '不可访问');

      try {
        const manifestRes = await fetch(addinBaseUrl + '/manifest-word.xml');
        const manifestText = await manifestRes.text();
        const host = new URL(addinBaseUrl).host;
        const matched = manifestText.includes(host);
        setBadge('check-manifest-badge', matched, matched ? '主机一致' : '主机不一致');
      } catch (_err) {
        setBadge('check-manifest-badge', false, '获取失败');
      }
    })();
  </script>
</body>
</html>`;
}

function safeGetHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
