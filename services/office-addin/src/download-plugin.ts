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

        // /download -> 返回下载页面
        if (url === '/download' || url === '/download.html') {
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
  <title>Carbone Office Add-in</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #2563eb; }
    .card { border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 10px; text-align: center; }
    a { text-decoration: none; color: inherit; }
  </style>
</head>
<body>
  <h1>Carbone Office Add-in</h1>
  <p>下载 Manifest 文件</p>
  <div style="display: flex; flex-wrap: wrap;">
    <a class="card" href="/manifest-word.xml" download>
      <div style="font-size: 32px;">📝</div>
      <div>Word</div>
    </a>
    <a class="card" href="/manifest-excel.xml" download>
      <div style="font-size: 32px;">📊</div>
      <div>Excel</div>
    </a>
    <a class="card" href="/manifest-ppt.xml" download>
      <div style="font-size: 32px;">📽️</div>
      <div>PPT</div>
    </a>
  </div>
  <p><a href="/test.html">测试页面</a></p>
</body>
</html>`;
}