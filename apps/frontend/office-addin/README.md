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

**Office Add-in 要求使用 HTTPS**，后端 API 也需要支持 HTTPS。对于局域网、多机器调试或远程访问场景，证书不能只覆盖 `localhost` 或 `127.0.0.1`。

### 服务端口说明

- **3000**: Office Add-in 前端服务 (HTTPS)
- **3100**: Carbone API HTTP 服务
- **3443**: Carbone API HTTPS 服务（推荐）

### 当前证书文件

证书位于 `docker/office-addin/certs/` 目录：
- `server.crt` - 当前服务实际使用的服务器证书
- `server.key` - 服务器私钥
- `ca.crt` - 仅在你改造成“内部 CA / 开发 CA 签发模式”后才作为根 CA 分发

### 最佳实践

1. **证书 SAN 必须覆盖所有访问入口**
   - 至少包含：`localhost`、`127.0.0.1`、当前局域网 IP、稳定开发域名
   - Office 实际访问的主机名必须和证书 SAN 完全一致

2. **manifest、Taskpane、API 使用统一对外主机**
   - Add-in 页面地址和 API 地址必须是客户端真实可访问的 HTTPS 地址
   - 不要在浏览器/Office 里使用容器内主机名，例如 `carbone-api`

3. **团队协作优先使用 CA 签发证书**
   - 推荐使用内部 CA、开发 CA 或 `mkcert`
   - 如果当前仍是自签名模式，直接信任 `server.crt`
   - 如果改为 CA 签发模式，应分发根 CA，而不是继续分发旧的自签名 `server.crt`

### 生成覆盖局域网主机的证书

```bash
# 示例：覆盖 localhost、本机回环、本机局域网 IP 和稳定开发域名
export OFFICE_ADDIN_TLS_HOSTS=localhost,127.0.0.1,192.168.100.143,addin.dev.local
./docker/office-addin/generate-certs.sh
```

### 安装当前自签名证书（Windows）

1. 双击 `server.crt` 文件
2. 选择 "安装证书"
3. 选择 "本地机器"
4. 选择 "将所有的证书放入以下存储" -> "受信任的根证书颁发机构"

或使用命令：

```powershell
certutil -addstore -f "Root" docker\office-addin\certs\server.crt
```

### 安装当前自签名证书（macOS）

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt
```

## Docker 启动

```bash
./docker/start-smart.sh docker-compose.addin.yml up -d
```

## 统一向导

推荐从运行中的 Add-in 实例打开向导页：

```text
https://<OFFICE_ADDIN_PUBLIC_HOST>:3000/wizard
```

Windows 用户下载 `office-addin-wizard.ps1` 后执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\office-addin-wizard.ps1 -HostName <OFFICE_ADDIN_PUBLIC_HOST>
```

该向导统一处理：
- 证书安装
- 证书状态确认
- Word/Excel/PowerPoint 安装
- 深度解析

旧的 `check-addin-cert.ps1`、`setup-word-addin.ps1`、`diagnose-word-addin.ps1` 仅保留为兼容包装层。

如果需要让其他设备通过局域网访问，建议在 `docker/.env` 里设置：

```bash
HOST_IP=192.168.100.143
OFFICE_ADDIN_PUBLIC_HOST=192.168.100.143
CARBONE_API_PUBLIC_HOST=192.168.100.143
OFFICE_ADDIN_TLS_HOSTS=localhost,127.0.0.1,192.168.100.143
```

服务将启动：
- Office Add-in: `https://<OFFICE_ADDIN_PUBLIC_HOST>:3000`
- Carbone API (HTTP): `http://<CARBONE_API_PUBLIC_HOST>:3100`
- Carbone API (HTTPS): `https://<CARBONE_API_PUBLIC_HOST>:3443`

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
2. 确认使用 HTTPS URL，并且主机名是实际可访问地址
3. 确认当前服务使用的证书已安装并受信任
4. 检查证书 SAN 是否包含当前访问主机
5. 检查端口是否被占用

**证书问题**
- Office 要求 HTTPS，且 WebView 对证书主机名校验更严格
- 自签名模式下，直接信任 `server.crt`
- CA 签发模式下，分发并信任根 CA，服务器返回完整证书链
- 访问主机名必须出现在证书 SAN 中

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
- HTTP: `http://<CARBONE_API_PUBLIC_HOST>:3100`
- HTTPS: `https://<CARBONE_API_PUBLIC_HOST>:3443`

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
