/**
 * 下载页面路由
 */

export function downloadPagePlugin() {
  return {
    name: 'download-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // /taskpane.html -> 让 Vite 处理 index.html
        if (url === '/taskpane.html' || url === '/taskpane') {
          req.url = '/index.html';
          next();
          return;
        }

        // /download -> 返回下载页面（不拦截 /download.html，让Vite处理public目录的文件）
        if (url === '/download') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getDownloadPageHtml());
          return;
        }

        // 其他请求 -> Vite 处理
        next();
      });
    }
  };
}

function getDownloadPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carbone Office Add-in 下载</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 { color: #4A90D9; font-size: 32px; margin-bottom: 10px; }
    .subtitle { color: #666; font-size: 18px; margin-bottom: 30px; }
    .download-box {
      background: #f0f7ff;
      border: 2px solid #4A90D9;
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .download-btn {
      display: inline-block;
      background: #4A90D9;
      color: white;
      font-size: 20px;
      padding: 15px 40px;
      border-radius: 8px;
      text-decoration: none;
      margin: 10px;
      transition: all 0.3s;
    }
    .download-btn:hover {
      background: #357ABD;
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(74,144,217,0.4);
    }
    .section {
      margin: 30px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .section h2 { color: #333; margin-bottom: 15px; font-size: 20px; }
    .section h3 { color: #555; margin: 20px 0 10px; font-size: 16px; }
    .steps { counter-reset: step; }
    .step {
      position: relative;
      padding: 15px 20px 15px 50px;
      margin: 10px 0;
      background: white;
      border-radius: 8px;
      border-left: 4px solid #4A90D9;
    }
    .step::before {
      counter-increment: step;
      content: counter(step);
      position: absolute;
      left: 15px;
      top: 50%;
      transform: translateY(-50%);
      background: #4A90D9;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      text-align: center;
      line-height: 24px;
      font-weight: bold;
    }
    .code {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 6px;
      font-family: 'Consolas', monospace;
      margin: 10px 0;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
    }
    .warning h4 { color: #856404; margin-bottom: 10px; }
    .files { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
    .file {
      flex: 1;
      min-width: 150px;
      padding: 15px;
      background: white;
      border-radius: 8px;
      text-align: center;
      border: 1px solid #ddd;
    }
    .file .icon { font-size: 40px; margin-bottom: 10px; }
    .file .name { font-weight: bold; color: #333; }
    .file .desc { color: #666; font-size: 14px; }
    .test-link {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #28a745;
      color: white;
      border-radius: 6px;
      text-decoration: none;
    }
    .test-link:hover { background: #218838; }
    ul { padding-left: 20px; }
    li { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; }
    th { background: #4A90D9; color: white; }
    td { border-bottom: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📄 Carbone Office Add-in</h1>
    <p class="subtitle">AI辅助模板生成工具 - 下载与安装</p>

    <div class="download-box">
      <p style="font-size: 16px; margin-bottom: 20px; color: #555;">下载完整安装包（包含manifest和CA证书）</p>
      <a class="download-btn" href="/carbone-addin-package.zip" download>
        📦 下载安装包 (ZIP)
      </a>
      <p style="margin-top: 15px; color: #888; font-size: 14px;">包含: manifest-word.xml, ca.crt, README.txt</p>
    </div>

    <div class="files">
      <div class="file">
        <div class="icon">📝</div>
        <div class="name">manifest-word.xml</div>
        <div class="desc">Word加载项配置</div>
      </div>
      <div class="file">
        <div class="icon">🔐</div>
        <div class="name">ca.crt</div>
        <div class="desc">SSL CA证书</div>
      </div>
      <div class="file">
        <div class="icon">📋</div>
        <div class="name">README.txt</div>
        <div class="desc">安装说明</div>
      </div>
    </div>

    <div class="section">
      <h2>🔧 Windows 安装步骤</h2>

      <h3>步骤1: 安装CA证书（必须）</h3>
      <div class="step">双击 ca.crt 文件，选择"安装证书" → "本地计算机" → "受信任的根证书颁发机构"</div>
      <div class="code">certutil -addstore -f "Root" ca.crt</div>

      <h3>步骤2: 配置加载项目录</h3>
      <div class="step">创建目录并注册到Office</div>
      <div class="code">mkdir C:\\OfficeAddins
copy manifest-word.xml C:\\OfficeAddins\\
reg add HKCU\\SOFTWARE\\Microsoft\\Office\\16.0\\Wef /v DevelopmentLocation /t REG_SZ /d "C:\\OfficeAddins" /f</div>

      <h3>步骤3: 重启Word</h3>
      <div class="step">关闭所有Word窗口，重新打开Word</div>

      <h3>步骤4: 查看加载项</h3>
      <div class="step">插入 → 我的加载项 → 共享文件夹 → Carbone Template Assistant</div>
    </div>

    <div class="warning">
      <h4>⚠️ 重要提示</h4>
      <p>服务地址使用 HTTPS 和主机IP <strong>localhost</strong>，请确保：</p>
      <ul>
        <li>CA证书已正确安装到"受信任的根证书颁发机构"</li>
        <li>Windows主机可以访问 localhost（同一网络）</li>
        <li>防火墙允许 3000 端口访问</li>
      </ul>
    </div>

    <div class="section">
      <h2>🌐 服务地址</h2>
      <table>
        <tr><th>服务</th><th>地址</th></tr>
        <tr><td>Add-in 页面</td><td><code>https://localhost:3000/taskpane.html</code></td></tr>
        <tr><td>Carbone API</td><td><code>http://localhost:3100</code></td></tr>
        <tr><td>健康检查</td><td><code>https://localhost:3000/health</code></td></tr>
      </table>
    </div>

    <div class="section" style="text-align: center;">
      <h2>✅ 测试连接</h2>
      <p style="margin-bottom: 15px;">在浏览器中测试服务是否正常运行：</p>
      <a class="test-link" href="/health" target="_blank">测试服务状态</a>
      <a class="test-link" href="/test.html" target="_blank" style="background: #17a2b8;">测试页面</a>
      <a class="test-link" href="/taskpane.html" target="_blank" style="background: #6c757d;">查看Taskpane</a>
    </div>
  </div>
</body>
</html>`;
}