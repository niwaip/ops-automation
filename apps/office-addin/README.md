# Carbone Office Add-in

Office Add-in for Carbone template generation with AI assistance.

支持 Word, Excel, PowerPoint。

## 功能特性

- 🤖 **AI 智能识别**: 自动识别文档结构，给出变量替换建议
- ✅ **一键应用**: 批量或单独应用 AI 建议
- 🎯 **手动选择**: 选择特定单元格/元素，自定义变量名
- ⚙️ **模板配置**: 选择模板类型、输出格式、参数配置
- 📝 **自动语法生成**: 根据配置生成 Carbone 标记语法
- 🔍 **格式校验**: 自动校验模板格式正确性
- 🔧 **调试日志面板**: 详细错误信息显示，便于排查问题

## 开发启动

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## HTTPS 配置（重要）

**Office Add-in 要求使用 HTTPS**，后端 API 也需要支持 HTTPS。

### 服务端口说明

- **3000**: Office Add-in 前端服务 (HTTPS)
- **3100**: Carbone API HTTP 服务
- **3443**: Carbone API HTTPS 服务（推荐）

### SSL 证书

证书位于 `docker/office-addin/certs/` 目录：
- `server.crt` - 服务器证书
- `server.key` - 服务器私钥
- `ca.crt` - CA 证书

### 安装 CA 证书（Windows）

1. 双击 `ca.crt` 文件
2. 选择 "安装证书"
3. 选择 "本地机器"
4. 选择 "将所有的证书放入以下存储" -> "受信任的根证书颁发机构"

### 安装 CA 证书（macOS）

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/ca.crt
```

## Docker 启动

```bash
cd docker
docker-compose up -d
```

服务将启动：
- Office Add-in: https://localhost:3000
- Carbone API (HTTP): http://localhost:3100
- Carbone API (HTTPS): https://localhost:3443

## Sideload 测试

```bash
# Word
npm run sideload:word

# Excel
npm run sideload:excel

# PowerPoint
npm run sideload:ppt
```

## 项目结构

```
src/
├── api/
│   └── carbone-api.ts     # 后端 API 对接
├── components/
│   ├── AIIdentifyPanel.tsx # AI 识别面板
│   ├── DebugLogPanel.tsx   # 调试日志面板
│   ├── TemplateConfigPanel.tsx # 模板配置面板
│   └── ManualSelector.tsx # 手动选择组件
├── taskpane/
│   ├── App.tsx           # 主应用
│   ├── store.ts          # 状态管理
│   ├── main.tsx          # 入口
│   └── styles.css        # 样式
└── utils/
    └── office-api.ts     # Office.js API 封装

manifest-word.xml   # Word manifest
manifest-excel.xml  # Excel manifest
manifest-ppt.xml    # PowerPoint manifest
```

## 使用流程

1. 打开 Office 文档
2. 点击 "Carbone" > "模板助手" 打开任务窗格
3. 检查连接状态（应显示 "已连接"）
4. 选择模板类型
5. 点击 "AI 智能识别" 分析文档
6. 查看建议，一键应用或单独应用
7. 配置输出格式
8. 点击 "生成模板" 完成

## 调试方法

### 使用调试日志面板

点击 "显示日志" 按钮，可以查看：
- API 调用详情
- 错误信息和堆栈
- 连接状态
- 操作记录

### 查看详细错误信息

点击错误消息可以展开查看详细信息：
- HTTP 状态码
- 响应数据
- 可能的解决方案

### 常见问题排查

**连接失败**
1. 检查后端服务是否启动
2. 确认使用 HTTPS URL (`https://localhost:3443`)
3. 确认 CA 证书已安装
4. 检查端口是否被占用

**证书问题**
- Office 要求 HTTPS，自签名证书需要安装到系统信任存储
- Windows 需要安装到 "受信任的根证书颁发机构"
- macOS 需要使用 `security add-trusted-cert` 命令

**AI 分析失败**
1. 点击 "测试连接" 检查后端状态
2. 查看调试日志面板的详细信息
3. 确认文档内容不为空

## 后端服务

需要启动官方 Carbone Docker 服务:

```bash
cd docker
docker-compose up -d
```

后端 API 地址:
- HTTP: http://localhost:3100
- HTTPS: https://localhost:3443 (推荐用于 Office Add-in)

## Carbone 语法参考

```
# 变量
{d.fieldName}

# 格式化
{d.date:formatDate(YYYY-MM-DD)}
{d.price:formatNumber(#,##0.00)}

# 循环
{#d.items}
  {d.items[i].name}: {d.items[i].price}
{/d.items}

# 条件
{d.field:ifTrue(等于某值):then(显示文本)}
```

## 发布

需要 Microsoft 365 Developer Program 账号。

1. 修改 manifest.xml 中的 URL 为生产环境地址
2. 部署前端静态文件
3. 通过 AppSource 发布