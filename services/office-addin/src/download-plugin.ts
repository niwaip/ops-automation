/**
 * 下载页面路由
 * 访问 /download 显示 manifest 下载页面
 */

import fs from 'fs';
import path from 'path';

export function downloadPagePlugin() {
  return {
    name: 'download-page',
    configureServer(server) {
      // /download 路由显示下载页面
      server.middlewares.use('/download', (req, res) => {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carbone Office Add-in 下载</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #2563eb; margin-bottom: 10px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .download-section {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    .download-card {
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: inherit;
    }
    .download-card:hover {
      border-color: #2563eb;
      background: #eff6ff;
    }
    .download-card .icon { font-size: 48px; margin-bottom: 10px; }
    .download-card .name { font-weight: 600; font-size: 18px; }
    .download-card .desc { color: #666; font-size: 14px; margin-top: 5px; }
    .status {
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .status.ok { background: #dcfce7; color: #166534; }
    .instructions {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      margin-top: 30px;
    }
    .instructions h3 { margin-top: 0; }
    .instructions ol { padding-left: 20px; }
    .instructions li { margin-bottom: 10px; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
    .cert-section { margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; }
    .cert-section h4 { margin: 0 0 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📄 Carbone Office Add-in</h1>
    <p class="subtitle">AI辅助模板生成工具</p>

    <div id="status" class="status ok">
      ✅ 服务运行中
    </div>

    <h2>下载 Manifest 文件</h2>
    <div class="download-section">
      <a class="download-card" href="/manifest-word.xml" download>
        <div class="icon">📝</div>
        <div class="name">Word</div>
        <div class="desc">manifest-word.xml</div>
      </a>
      <a class="download-card" href="/manifest-excel.xml" download>
        <div class="icon">📊</div>
        <div class="name">Excel</div>
        <div class="desc">manifest-excel.xml</div>
      </a>
      <a class="download-card" href="/manifest-ppt.xml" download>
        <div class="icon">📽️</div>
        <div class="name">PowerPoint</div>
        <div class="desc">manifest-ppt.xml</div>
      </a>
    </div>

    <div class="instructions">
      <h3>加载步骤</h3>
      <ol>
        <li>点击上方卡片下载 manifest 文件</li>
        <li>打开对应的 Office 应用（Word/Excel/PPT）</li>
        <li>点击 <strong>插入</strong> → <strong>加载项</strong> → <strong>我的加载项</strong></li>
        <li>点击 <strong>上传我的加载项</strong>（如没有此选项，见下方说明）</li>
        <li>选择下载的 manifest 文件</li>
      </ol>
    </div>

    <div class="cert-section">
      <h4>⚠️ MacOS 信任证书</h4>
      <p>首次使用需要在系统中信任SSL证书：</p>
      <code>sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt</code>
    </div>

    <div class="instructions" style="margin-top: 20px;">
      <h3>找不到"上传我的加载项"？</h3>
      <ol>
        <li>点击 <strong>文件</strong> → <strong>选项</strong> → <strong>自定义功能区</strong></li>
        <li>勾选 <strong>开发工具</strong></li>
        <li>在 <strong>开发工具</strong> 选项卡中找到加载项</li>
      </ol>
    </div>
  </div>

  <script>
    fetch('/health').then(r => r.json()).then(() => {
      document.getElementById('status').className = 'status ok';
      document.getElementById('status').textContent = '✅ 服务运行中';
    }).catch(() => {
      document.getElementById('status').className = 'status error';
      document.getElementById('status').textContent = '❌ 服务未启动';
    });
  </script>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    }
  };
}