# Office Add-in Sideload 指南

## 快速启动（推荐）

```bash
# 使用 Smart Launcher 启动 Add-in 环境
./docker/scripts/start-smart.sh docker-compose.addin.yml up -d
```

如果需要从局域网其他机器访问，请先在 `docker/.env` 中设置：

```bash
HOST_IP=192.168.100.143
OFFICE_ADDIN_PUBLIC_HOST=192.168.100.143
CARBONE_API_PUBLIC_HOST=192.168.100.143
OFFICE_ADDIN_TLS_HOSTS=localhost,127.0.0.1,192.168.100.143
```

此命令会：
1. 自动识别当前工作区 (Worktree) 并挂载代码
2. 启动全栈基础设施及 Office Add-in 服务
3. 确保环境变量及网络配置正确

> **提示**：Windows 本地安装、证书信任、Word/Excel/PowerPoint 注册和深度排查，统一走 `https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/wizard` 下载 `office-addin-wizard.ps1`。

---

## 方法一：统一向导（Windows，推荐）

1. 打开：

```text
https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/wizard
```

2. 下载 `office-addin-wizard.ps1`

3. 在管理员 PowerShell 里执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\office-addin-wizard.ps1 -HostName ${OFFICE_ADDIN_PUBLIC_HOST:-localhost}
```

4. 按菜单选择：
   - `1` 证书安装
   - `2` 证书状态确认
   - `3` 安装 Word
   - `4` 安装 Excel
   - `5` 安装 PowerPoint
   - `6` 深度解析

---

## 方法二：命令行自动加载

```bash
# 安装工具
npm install -g office-addin-debugging

# 下载当前运行实例生成的 manifest
curl -k https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-word.xml -o /tmp/manifest-word.xml

# 加载到 Word
office-addin-debugging start /tmp/manifest-word.xml

# 加载到 Excel
curl -k https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-excel.xml -o /tmp/manifest-excel.xml
office-addin-debugging start /tmp/manifest-excel.xml

# 加载到 PowerPoint
curl -k https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-ppt.xml -o /tmp/manifest-ppt.xml
office-addin-debugging start /tmp/manifest-ppt.xml
```

---

## 方法三：通过 Office 应用加载

### Word 2016+ / Microsoft 365

1. 打开 Word
2. 点击 **文件** → **选项** → **自定义功能区**
3. 勾选 **开发工具** → 确定
4. 点击 **开发工具** 选项卡
5. 点击 **加载项** → **添加**
6. 选择 `manifest-word.xml` 文件

### Excel

1. 打开 Excel
2. 点击 **插入** → **加载项** → **我的加载项**
3. 选择 **上传我的加载项**
4. 选择 `manifest-excel.xml` 文件

### PowerPoint

1. 打开 PowerPoint
2. 点击 **插入** → **加载项** → **我的加载项**
3. 选择 **上传我的加载项**
4. 选择 `manifest-ppt.xml` 文件

---

## 方法四：通过 Web 版 Office 加载

### Word Online

1. 打开 https://office.com
2. 创建或打开 Word 文档
3. 点击 **插入** → **Office 加载项**
4. 点击 **上传我的加载项**
5. 选择 manifest 文件

---

## 方法五：使用 Office Add-in Debugger（开发者）

```bash
# 安装 office-addin-debugging
npm install -g office-addin-debugging

# 启动并自动 sideload
cd services/office-addin
npm run sideload:word
```

---

## 方法六：手动注册 manifest（Windows）

1. 打开注册表编辑器 (regedit)
2. 导航到 `HKEY_CURRENT_USER\SOFTWARE\Microsoft\Office\16.0\Wef\Developer`
3. 创建字符串值，名称随意，值为 manifest 文件完整路径
4. 重启 Office

---

## 方法七：使用 Microsoft 365 开发者计划

1. 注册 Microsoft 365 开发者账号
2. 使用 App Source 部署

---

## 常见问题

### Q: 提示"加载项错误"？

**最常见原因：TLS 证书不被信任，或访问主机名不在证书 SAN 中**

**解决方案 (MacOS)：**
```bash
# 方法1: 命令行信任
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt

# 方法2: 钥匙串访问
# 1. 打开"钥匙串访问"应用
# 2. 文件 → 导入项目 → 选择 docker/office-addin/certs/server.crt
# 3. 双击证书 → 信任 → 设置为"始终信任"
```

**解决方案 (Windows)：**
```powershell
# 以管理员身份运行 PowerShell
certutil -addstore "Root" docker\office-addin\certs\server.crt
```

**检查清单：**
1. 确保服务已启动: `curl -k https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/health`
2. 确保当前服务使用的证书已信任
3. 确保 manifest 文件中的 URL 与当前访问主机一致
4. 确保证书 SAN 中包含当前访问主机名或局域网 IP

### Q: 局域网访问时报"不安全连接"？

**原因：**
- 证书只覆盖了 `localhost`
- 你正在通过局域网 IP 或另一台机器访问 Add-in
- Office WebView 不接受主机名与证书 SAN 不匹配的 HTTPS 连接

**最佳实践：**
1. 生成覆盖所有开发入口的证书
2. `manifest`、Taskpane、API 全部使用同一个对外主机
3. 团队协作时优先使用内部 CA 或 `mkcert`

**示例：**
```bash
export OFFICE_ADDIN_TLS_HOSTS=localhost,127.0.0.1,192.168.100.143,addin.dev.local
./docker/office-addin/generate-certs.sh
```

### Q: 找不到"上传我的加载项"选项？

**可能原因：**
- Office 版本过旧（需要 2016 或更新）
- 组织策略限制
- 使用的是 Web 版，需要桌面版

**解决方案：**
- 更新 Office 到最新版本
- 联系管理员启用开发人员功能
- 使用 Web 版 Office + 方法二

### Q: 提示"无法加载加载项"？

**检查清单：**
1. 确保服务已启动: `https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000`
2. 确保 TLS 证书已信任
3. 检查 manifest 文件路径正确

**信任 SSL 证书 (MacOS)：**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt
```

### Q: 只看到 AppSource 加载项？

**启用开发人员模式：**
1. Word → 文件 → 选项 → 自定义功能区
2. 勾选"开发工具"
3. 开发工具选项卡 → 加载项

---

## 验证服务状态

```bash
# 检查 Office Add-in
curl -k https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000

# 检查 Carbone API
curl -k https://${CARBONE_API_PUBLIC_HOST:-localhost}:3443/health
```

---

## Manifest 文件位置

动态下载地址：

```text
https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-word.xml
https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-excel.xml
https://${OFFICE_ADDIN_PUBLIC_HOST:-localhost}:3000/manifest-ppt.xml
```
