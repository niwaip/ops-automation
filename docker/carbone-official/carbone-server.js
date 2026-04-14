/**
 * Carbone Official API Server
 * 使用官方 carbone 包，提供标准 API 接口
 * 支持 HTTPS (使用与 office-addin 相同的证书)
 * 代理 /studio/* 请求到 carbone-engine 服务
 */

const express = require('express');
const carbone = require('carbone');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');
const http = require('http');

const app = express();
const HTTP_PORT = process.env.CARBONE_API_PORT || 3100;
const HTTPS_PORT = process.env.CARBONE_API_HTTPS_PORT || 3443;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const CARBONE_ENGINE_URL = process.env.CARBONE_ENGINE_URL || 'http://carbone-engine:3009';

// CORS 配置 - 允许 Office Add-in 访问
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 配置文件上传
const upload = multer({ dest: '/tmp/uploads/' });

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: carbone.version, service: 'carbone-api' });
});

/**
 * 代理请求到 carbone-engine 服务
 * - /studio/* API请求代理到 carbone-engine /studio/*
 * - 静态资源(css, js等)代理到 carbone-engine
 */
const proxyToEngine = (req, res, targetPath) => {
  const targetUrl = `${CARBONE_ENGINE_URL}${targetPath}`;

  console.log(`[Proxy] ${req.method} ${req.path} -> ${targetUrl}`);

  const options = {
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Authorization': req.headers['authorization'] || '',
    }
  };

  const proxyReq = http.request(targetUrl, options, (proxyRes) => {
    // 设置响应头
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');

    // 判断是否是二进制响应（文件下载）
    const contentType = proxyRes.headers['content-type'] || '';
    const isBinary = contentType.includes('octet-stream') ||
                     contentType.includes('application/vnd.') ||
                     contentType.includes('pdf');

    if (isBinary) {
      // 二进制数据：使用Buffer数组收集
      const chunks = [];
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });

      proxyRes.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // 传递Content-Disposition头（用于下载文件名）
        if (proxyRes.headers['content-disposition']) {
          res.setHeader('Content-Disposition', proxyRes.headers['content-disposition']);
        }
        res.status(proxyRes.statusCode).send(buffer);
      });
    } else {
      // 文本/JSON数据：使用字符串收集
      let body = '';
      proxyRes.on('data', (chunk) => {
        body += chunk;
      });

      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).send(body);
      });
    }
  });

  proxyReq.on('error', (error) => {
    console.error(`[Proxy Error] ${error.message}`);
    res.status(500).json({
      error: 'Failed to connect to carbone-engine service',
      details: error.message,
      targetUrl: targetUrl
    });
  });

  // 发送请求体（如果有）
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
};

// 代理静态资源
app.use('/css', (req, res) => proxyToEngine(req, res, `/css${req.path}`));
app.use('/js', (req, res) => proxyToEngine(req, res, `/js${req.path}`));
app.use('/api', (req, res) => proxyToEngine(req, res, `/api${req.path}`));

// 根路径代理到carbone-engine UI
app.get('/', (req, res) => proxyToEngine(req, res, '/'));

/**
 * 代理 /studio/* API请求到 carbone-engine 服务
 */
app.use('/studio', (req, res) => proxyToEngine(req, res, `/studio${req.path}`));

/**
 * 渲染模板
 * POST /render
 * Body: { template: string (base64), data: object, options: object }
 */
app.post('/render', async (req, res) => {
  try {
    const { template, data, options = {} } = req.body;

    // 解码模板文件
    const templateBuffer = Buffer.from(template, 'base64');
    const templatePath = `/tmp/template_${Date.now()}.docx`;
    fs.writeFileSync(templatePath, templateBuffer);

    // 使用官方 carbone 渲染
    carbone.render(templatePath, data, options, (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // 清理临时文件
      fs.unlinkSync(templatePath);

      // 返回渲染结果
      res.json({
        success: true,
        result: result.toString('base64'),
        format: options.convertTo || 'docx'
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 上传模板并渲染
 * POST /render-file
 */
app.post('/render-file', upload.single('template'), async (req, res) => {
  try {
    const templatePath = req.file.path;
    const data = JSON.parse(req.body.data || '{}');
    const options = JSON.parse(req.body.options || '{}');

    carbone.render(templatePath, data, options, (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // 清理临时文件
      fs.unlinkSync(templatePath);

      // 直接返回文件
      const filename = `output_${Date.now()}.${options.convertTo || 'docx'}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(result);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 添加格式化器
 * POST /formatter
 * Body: { name: string, code: string }
 */
app.post('/formatter', (req, res) => {
  try {
    const { name, code } = req.body;

    // 使用官方 carbone 添加格式化器
    carbone.addFormatter(name, new Function('return ' + code)());

    res.json({ success: true, message: `Formatter '${name}' added` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取模板中的变量列表
 * POST /parse
 */
app.post('/parse', async (req, res) => {
  try {
    const { template } = req.body;

    const templateBuffer = Buffer.from(template, 'base64');
    const templatePath = `/tmp/template_${Date.now()}.docx`;
    fs.writeFileSync(templatePath, templateBuffer);

    // 使用官方 carbone 解析模板
    const result = await parseTemplate(templatePath);

    fs.unlinkSync(templatePath);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 解析模板变量（使用官方 carbone）
 */
async function parseTemplate(templatePath) {
  // 解压 docx 文件读取 content.xml
  const JSZip = require('jszip');
  const zip = new JSZip();

  const templateContent = fs.readFileSync(templatePath);
  const zipContent = await zip.loadAsync(templateContent);

  const contentXml = await zipContent.file('word/document.xml').async('string');

  // 提取所有 {d.xxx} 标记
  const regex = /\{([cdt])\.([^}]+)\}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(contentXml)) !== null) {
    const fullMatch = match[0];
    const context = match[1];
    const path = match[2];

    // 解析路径和格式化器
    const colonIndex = path.indexOf(':');
    const varPath = colonIndex > 0 ? path.substring(0, colonIndex) : path;
    const formatter = colonIndex > 0 ? path.substring(colonIndex + 1) : null;

    variables.push({
      marker: fullMatch,
      path: `${context}.${varPath}`,
      formatter: formatter,
      isArray: varPath.includes('[i]')
    });
  }

  return {
    variables,
    totalMarkers: variables.length
  };
}

/**
 * 转换文件格式
 * POST /convert
 */
app.post('/convert', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const targetFormat = req.body.format || 'pdf';

    const options = { convertTo: targetFormat };

    // 使用空数据渲染（仅转换格式）
    carbone.render(filePath, {}, options, (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      fs.unlinkSync(filePath);

      const filename = `output_${Date.now()}.${targetFormat}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(result);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务
if (ENABLE_HTTPS) {
  // 读取 SSL 证书 (使用与 office-addin 相同的证书)
  const certPath = process.env.CERT_PATH || '/app/certs';
  const sslOptions = {
    key: fs.readFileSync(path.join(certPath, 'server.key')),
    cert: fs.readFileSync(path.join(certPath, 'server.crt')),
  };

  // 启动 HTTPS 服务器
  https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
    console.log(`Carbone Official API running with HTTPS on port ${HTTPS_PORT}`);
    console.log(`Health check: https://localhost:${HTTPS_PORT}/health`);
    console.log(`Render endpoint: POST https://localhost:${HTTPS_PORT}/render`);
  });
} else {
  // 启动 HTTP 服务器
  app.listen(HTTP_PORT, () => {
    console.log(`Carbone Official API running on port ${HTTP_PORT}`);
    console.log(`Health check: http://localhost:${HTTP_PORT}/health`);
    console.log(`Render endpoint: POST http://localhost:${HTTP_PORT}/render`);
  });
}