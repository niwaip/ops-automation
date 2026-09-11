/**
 * Office Add-in 向导页面路由
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'fs';
import path from 'path';
import type { ViteDevServer } from 'vite';
import {
  DEFAULT_OFFICE_ADDIN_API_BASE_URL,
  DEFAULT_OFFICE_ADDIN_BASE_URL,
} from './config/defaults';

type MiddlewareNext = (err?: unknown) => void;

const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true';
const certsPath = isDocker
  ? '/app/certs'
  : fs.existsSync(path.resolve(__dirname, '../../../docker/office-addin/runtime-certs'))
    ? path.resolve(__dirname, '../../../docker/office-addin/runtime-certs')
    : path.resolve(process.cwd(), '../../docker/office-addin/runtime-certs');
const publicPath = fs.existsSync(path.resolve(__dirname, '../public'))
  ? path.resolve(__dirname, '../public')
  : path.resolve(process.cwd(), 'public');
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
      server.middlewares.use(
        (req: IncomingMessage & { url?: string }, res: ServerResponse, next: MiddlewareNext) => {
          const url = req.url || '';
          const [pathname, search] = url.split('?');
          const cleanPath = pathname || '';
          const queryString = search ? `?${search}` : '';

          const manifestName = cleanPath.replace(/^\//, '');
          if (manifestFiles.has(manifestName)) {
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${manifestName}"`);
            res.end(renderManifest(manifestName));
            return;
          }

          // /taskpane.html -> 让 Vite 处理 index.html
          if (cleanPath === '/taskpane.html' || cleanPath === '/taskpane') {
            req.url = `/index.html${queryString}`;
            next();
            return;
          }

          // 证书下载支持 /server.crt 与 /ca.crt
          if (cleanPath === '/server.crt' || cleanPath === '/ca.crt') {
            const certFile = path.join(certsPath, 'server.crt');
            if (fs.existsSync(certFile)) {
              res.setHeader('Content-Type', 'application/x-x509-ca-cert');
              res.setHeader('Content-Disposition', 'attachment; filename="server.crt"');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(fs.readFileSync(certFile));
              return;
            }
          }

          // PowerShell 脚本下载：显式指定 application/x-powershell 与 attachment，解决浏览器拦截
          if (cleanPath.endsWith('.ps1')) {
            const scriptName = path.basename(cleanPath);
            const scriptFile = path.join(publicPath, scriptName);
            if (fs.existsSync(scriptFile)) {
              res.setHeader('Content-Type', 'application/x-powershell; charset=utf-8');
              res.setHeader('Content-Disposition', `attachment; filename="${scriptName}"`);
              res.setHeader('Cache-Control', 'no-cache');
              res.end(fs.readFileSync(scriptFile));
              return;
            }
          }

          if (cleanPath === '/download' || cleanPath === '/download.html') {
            res.statusCode = 302;
            res.setHeader('Location', `/wizard${queryString}`);
            res.end();
            return;
          }

          if (cleanPath === '/wizard' || cleanPath === '/wizard.html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(getWizardPageHtml());
            return;
          }

          next();
        }
      );
    },
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
      margin-bottom: 12px;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin-top: 14px;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #4A90D9;
      color: white;
      font-size: 15px;
      font-weight: 600;
      padding: 12px 20px;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.25s;
    }
    .download-btn:hover {
      background: #357ABD;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(74, 144, 217, 0.35);
    }
    .download-btn.secondary {
      background: #28a745;
    }
    .download-btn.secondary:hover {
      background: #218838;
      box-shadow: 0 5px 15px rgba(40, 167, 69, 0.35);
    }
    .section {
      margin-top: 24px;
      padding: 22px;
      background: #f8f9fa;
      border-radius: 10px;
    }
    .section h2 { color: #333; margin-bottom: 15px; font-size: 20px; }
    .files-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 14px;
    }
    .file-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .file-card:hover {
      border-color: #4A90D9;
      box-shadow: 0 4px 12px rgba(74, 144, 217, 0.15);
      transform: translateY(-2px);
    }
    .file-icon { font-size: 32px; margin-bottom: 8px; }
    .file-name { font-weight: 700; color: #2d3748; font-size: 15px; margin-bottom: 4px; word-break: break-all; }
    .file-desc { color: #718096; font-size: 13px; line-height: 1.4; margin-bottom: 12px; flex-grow: 1; }
    .file-action {
      display: inline-block;
      padding: 8px 14px;
      background: #ebf8ff;
      color: #3182ce;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }
    .file-action:hover {
      background: #3182ce;
      color: white;
    }
    .warning-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
      border-radius: 8px;
      padding: 14px 18px;
      margin-top: 14px;
      color: #92400e;
      font-size: 14px;
      line-height: 1.6;
    }
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
    .code-box {
      position: relative;
      margin: 10px 0;
    }
    .code {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 14px 70px 14px 14px;
      border-radius: 8px;
      font-family: 'Consolas', monospace;
      white-space: pre-wrap;
      overflow-x: auto;
      font-size: 13px;
    }
    .copy-btn {
      position: absolute;
      right: 10px;
      top: 10px;
      background: #333;
      border: 1px solid #555;
      color: #ddd;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .copy-btn:hover {
      background: #4A90D9;
      color: white;
      border-color: #4A90D9;
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
    .quick-links {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .quick-link {
      padding: 8px 16px;
      background: #e2e8f0;
      color: #4a5568;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      transition: all 0.2s;
    }
    .quick-link:hover {
      background: #4A90D9;
      color: white;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Carbone Office Add-in 向导</h1>
    <p class="subtitle">安装向导、PS 自动化脚本、SSL 证书及 Manifest 下载专区</p>

    <!-- 顶部推荐：终端一键执行 -->
    <div class="hero-box">
      <h3 style="color: #2b6cb0; margin-bottom: 8px;">⚡ 推荐：Windows 管理员终端一键执行（免手动下载）</h3>
      <p>无需在浏览器中点击下载，在 Windows 打开<strong>以管理员身份运行的 PowerShell</strong>，直接粘贴并回车运行以下命令，将自动下载脚本并进入交互向导：</p>
      <div class="code-box">
        <div class="code" id="cmd-oneliner">mkdir C:\\OfficeAddins -Force; cd C:\\OfficeAddins; curl.exe -k -o office-addin-wizard.ps1 "${escapeHtml(addinBaseUrl)}/office-addin-wizard.ps1"; powershell -ExecutionPolicy Bypass -File .\\office-addin-wizard.ps1 -HostName ${escapeHtml(addinHostname)}</div>
        <button class="copy-btn" onclick="copyText('cmd-oneliner')">复制命令</button>
      </div>
      <div class="hero-actions">
        <a class="download-btn" href="/office-addin-wizard.ps1" download="office-addin-wizard.ps1">📥 下载向导脚本 (office-addin-wizard.ps1)</a>
        <a class="download-btn secondary" href="/server.crt" download="server.crt">🔐 下载根证书 (server.crt)</a>
      </div>
    </div>

    <!-- 下载专区 -->
    <div class="section">
      <h2>📦 文件下载中心</h2>
      <p style="color: #666; font-size: 14px;">所有清单文件（Manifest）已自动注入当前服务地址 <code>${escapeHtml(addinBaseUrl)}</code>：</p>
      <div class="files-grid">
        <div class="file-card">
          <div class="file-icon">🚀</div>
          <div class="file-name">office-addin-wizard.ps1</div>
          <div class="file-desc">全能向导脚本，支持一键安装证书、注册 Word/Excel/PPT 及环境诊断</div>
          <a class="file-action" href="/office-addin-wizard.ps1" download="office-addin-wizard.ps1">下载向导脚本</a>
        </div>
        <div class="file-card">
          <div class="file-icon">🔐</div>
          <div class="file-name">server.crt</div>
          <div class="file-desc">HTTPS 根证书（必装，解决“你的连接不是专用连接”及 Office 信任报错）</div>
          <a class="file-action" href="/server.crt" download="server.crt">下载 SSL 证书</a>
        </div>
        <div class="file-card">
          <div class="file-icon">📝</div>
          <div class="file-name">manifest-word.xml</div>
          <div class="file-desc">Word 模板助手清单配置</div>
          <a class="file-action" href="/manifest-word.xml" download="manifest-word.xml">下载 Word 清单</a>
        </div>
        <div class="file-card">
          <div class="file-icon">📊</div>
          <div class="file-name">manifest-excel.xml</div>
          <div class="file-desc">Excel 模板助手清单配置</div>
          <a class="file-action" href="/manifest-excel.xml" download="manifest-excel.xml">下载 Excel 清单</a>
        </div>
        <div class="file-card">
          <div class="file-icon">📽️</div>
          <div class="file-name">manifest-ppt.xml</div>
          <div class="file-desc">PowerPoint 模板助手清单配置</div>
          <a class="file-action" href="/manifest-ppt.xml" download="manifest-ppt.xml">下载 PPT 清单</a>
        </div>
        <div class="file-card">
          <div class="file-icon">🛠️</div>
          <div class="file-name">setup-word-addin.ps1</div>
          <div class="file-desc">快捷脚本（快速一键安装 Word 加载项）</div>
          <a class="file-action" href="/setup-word-addin.ps1" download="setup-word-addin.ps1">下载快捷脚本</a>
        </div>
        <div class="file-card">
          <div class="file-icon">🔍</div>
          <div class="file-name">diagnose-word-addin.ps1</div>
          <div class="file-desc">Word 深度排查诊断脚本</div>
          <a class="file-action" href="/diagnose-word-addin.ps1" download="diagnose-word-addin.ps1">下载诊断脚本</a>
        </div>
        <div class="file-card">
          <div class="file-icon">🩺</div>
          <div class="file-name">check-addin-cert.ps1</div>
          <div class="file-desc">证书安装状态与 SAN 检查脚本</div>
          <a class="file-action" href="/check-addin-cert.ps1" download="check-addin-cert.ps1">下载证书检查脚本</a>
        </div>
      </div>

      <div class="warning-box">
        <strong>⚠️ 浏览器下载提示：</strong>
        Edge 或 Chrome 浏览器由于安全机制，在下载 <code>.ps1</code> 脚本时可能提示<em>“无法安全下载”</em>或<em>“此文件可能会损害你的设备”</em>。
        请将鼠标移到下载项，点击 <strong>“...”</strong>（更多选项），选择 <strong>“保留” ➔ “仍要保留”</strong> 即可正常保存。
      </div>
    </div>

    <!-- 步骤指南 -->
    <div class="section">
      <h2>📖 部署步骤说明</h2>
      <div class="step" data-step="1">
        <strong>下载或拉取脚本</strong>：点击上方按钮下载 <code>office-addin-wizard.ps1</code>，或使用推荐的终端命令一键拉取。
      </div>
      <div class="step" data-step="2">
        <strong>管理员权限运行</strong>：以管理员身份打开 PowerShell，进入脚本目录执行：
        <div class="code-box">
          <div class="code" id="cmd-run">powershell -ExecutionPolicy Bypass -File .\\office-addin-wizard.ps1 -HostName ${escapeHtml(addinHostname)}</div>
          <button class="copy-btn" onclick="copyText('cmd-run')">复制</button>
        </div>
      </div>
      <div class="step" data-step="3">
        <strong>按菜单交互操作</strong>：首次推荐按 <code>1 -> 2 -> 6</code> 顺序进行：
        <div class="menu-list">
          <div class="menu-item"><strong>1. 证书安装</strong>自动导入 server.crt 到“受信任的根证书颁发机构”。</div>
          <div class="menu-item"><strong>2. 证书状态确认</strong>验证证书 SAN 与 HTTPS 连通性。</div>
          <div class="menu-item"><strong>3. 安装 Word</strong>下载并向系统注册 Word 任务窗格。</div>
          <div class="menu-item"><strong>4. 安装 Excel</strong>下载并向系统注册 Excel 任务窗格。</div>
          <div class="menu-item"><strong>5. 安装 PowerPoint</strong>下载并向系统注册 PPT 任务窗格。</div>
          <div class="menu-item"><strong>6. 深度解析</strong>全面排查 Office 加载项加载失败原因。</div>
        </div>
      </div>
    </div>

    <!-- 快速链接与自检 -->
    <div class="section">
      <h2>🌐 快捷入口与状态自检</h2>
      <div class="quick-links">
        <a class="quick-link" href="/taskpane.html" target="_blank">🚀 打开任务窗格 (/taskpane.html)</a>
        <a class="quick-link" href="/test.html" target="_blank">🧪 测试页面 (/test.html)</a>
        <a class="quick-link" href="/health" target="_blank">🩺 服务健康状态 (/health)</a>
      </div>
      <div class="checks">
        <div class="check-item">
          <div class="check-title">Add-in 服务</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}</div>
          <span class="badge" id="check-addin-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">Carbone API</div>
          <div class="check-value">${escapeHtml(apiBaseUrl)}</div>
          <span class="badge" id="check-api-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">Manifest 目标主机</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}/manifest-word.xml</div>
          <span class="badge" id="check-manifest-badge">检测中...</span>
        </div>
        <div class="check-item">
          <div class="check-title">当前向导页</div>
          <div class="check-value">${escapeHtml(addinBaseUrl)}/wizard</div>
          <span class="badge ok">正常加载</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    function copyText(elementId) {
      const text = document.getElementById(elementId).innerText;
      navigator.clipboard.writeText(text).then(() => {
        alert('命令已复制到剪贴板！');
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('命令已复制到剪贴板！');
      });
    }

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
