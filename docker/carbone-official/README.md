# Carbone Official Docker

使用官方 Carbone 包，不定制化。提供标准 API 接口供 Office Add-in 调用。

## 快速启动

```bash
# 进入目录
cd docker/carbone-official

# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## API 端点

### 健康检查

```
GET http://localhost:3100/health
```

### 渲染模板

```
POST http://localhost:3100/render
Body: {
  "template": "base64编码的模板文件",
  "data": { ... },
  "options": { "convertTo": "pdf" }
}
```

### 上传文件渲染

```
POST http://localhost:3100/render-file
Content-Type: multipart/form-data
- template: 模板文件
- data: JSON数据
- options: JSON配置
```

### 解析模板变量

```
POST http://localhost:3100/parse
Body: {
  "template": "base64编码的模板文件"
}
```

### 转换格式

```
POST http://localhost:3100/convert
Content-Type: multipart/form-data
- file: 文件
- format: 目标格式 (pdf, docx, xlsx等)
```

### 添加格式化器

```
POST http://localhost:3100/formatter
Body: {
  "name": "myFormatter",
  "code": "function(d) { return d.toUpperCase(); }"
}
```

## 示例模板

在 `templates/` 目录放置 `.docx` 模板文件，使用 Carbone 标记语法：

```
{d.title}
{d.date:formatDate(YYYY-MM-DD)}
{#d.items}
  {d.items[i].name}: {d.items[i].price:formatNumber(#,##0.00)}
{/d.items}
```

## 注意事项

- 需要 LibreOffice 支持 PDF 转换
- 支持格式: DOCX, XLSX, ODT, ODS, PDF, CSV
- 文件大小限制: 50MB

## 官方文档

- [Carbone Documentation](https://carbone.io/documentation.html)
- [GitHub Repository](https://github.com/carboneio/carbone)
