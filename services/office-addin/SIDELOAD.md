# Office Add-in Sideload 指南

## 方法一：通过 Office 应用加载（推荐）

### Word 2016+ / Microsoft 365

1. 打开 Word
2. 点击 **插入** 选项卡
3. 点击 **加载项** → **我的加载项**
4. 如果看到 **上传我的加载项**，点击它
5. 选择 `manifest-word.xml` 文件

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

## 方法二：通过 Web 版 Office 加载

### Word Online

1. 打开 https://office.com
2. 创建或打开 Word 文档
3. 点击 **插入** → **Office 加载项**
4. 点击 **上传我的加载项**
5. 选择 manifest 文件

---

## 方法三：使用 Office Add-in Debugger（开发者）

```bash
# 安装 office-addin-debugging
npm install -g office-addin-debugging

# 启动并自动 sideload
cd services/office-addin
npm run sideload:word
```

---

## 方法四：手动注册 manifest（Windows）

1. 打开注册表编辑器 (regedit)
2. 导航到 `HKEY_CURRENT_USER\SOFTWARE\Microsoft\Office\16.0\Wef\Developer`
3. 创建字符串值，名称随意，值为 manifest 文件完整路径
4. 重启 Office

---

## 方法五：使用 Microsoft 365 开发者计划

1. 注册 Microsoft 365 开发者账号
2. 使用 App Source 部署

---

## 常见问题

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
1. 确保服务已启动: https://localhost:3000
2. 确保 SSL 证书已信任
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
curl -k https://localhost:3000

# 检查 Carbone API
curl http://localhost:3100/health
```

---

## Manifest 文件位置

```
services/office-addin/
├── manifest-word.xml   # Word
├── manifest-excel.xml  # Excel
└── manifest-ppt.xml    # PowerPoint
```