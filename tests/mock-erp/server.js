const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 80;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // Safe path resolution
  let safeUrl = req.url.split('?')[0];
  let filePath = path.join(PUBLIC_DIR, safeUrl === '/' ? 'index.html' : safeUrl);

  // Prevent directory traversal attacks
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  let contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server
  .listen(PORT, () => {
    console.log(`\n\x1b[32m🚀 [Mock ERP] Server is running at http://localhost\x1b[0m`);
    console.log(`\x1b[36m👉 Access the site in your browser: http://localhost\x1b[0m\n`);
    console.log(`Press Ctrl+C to stop the server.`);
  })
  .on('error', (err) => {
    if (err.code === 'EACCES') {
      console.error(
        `\n\x1b[31m❌ Error: Port ${PORT} is a privileged port and requires administrative privileges (sudo).\x1b[0m`
      );
      console.error(
        `\x1b[33m👉 Please run the command with sudo or use the start.sh script.\x1b[0m\n`
      );
    } else if (err.code === 'EADDRINUSE') {
      console.error(
        `\n\x1b[31m❌ Error: Port ${PORT} is already in use by another process.\x1b[0m`
      );
      console.error(
        `\x1b[33m👉 Please stop any other web servers running on port 80 first.\x1b[0m\n`
      );
    } else {
      console.error(`Server Error:`, err.message);
    }
    process.exit(1);
  });
