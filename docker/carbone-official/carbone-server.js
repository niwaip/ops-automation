/**
 * Carbone Official API Server
 * 使用官方 carbone 包，提供标准 API 接口
 */

const express = require('express');
const carbone = require('carbone');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.CARBONE_API_PORT || 3100;

// 配置文件上传
const upload = multer({ dest: '/tmp/uploads/' });

// 中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: carbone.version });
});

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
app.listen(PORT, () => {
  console.log(`Carbone Official API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Render endpoint: POST http://localhost:${PORT}/render`);
});