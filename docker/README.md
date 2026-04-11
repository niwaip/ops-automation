# Carbone Docker Services

统一启动 Office Add-in 和 Carbone API 服务。

## 快速启动

```bash
cd docker

# 生成 SSL 证书并启动服务
chmod +x start.sh
./start.sh
```

## 服务地址

| 服务 | 地址 | 说明 |
|------|------|------|
| Office Add-in | https://localhost:3000 | HTTPS (Office Add-in 要求) |
| Carbone API | http://localhost:3100 | Carbone 官方 API |

## 单独启动

```bash
# 只启动 Carbone API
docker-compose up -d carbone-api

# 只启动 Office Add-in
docker-compose up -d office-addin

# 查看日志
docker-compose logs -f
```

## Sideload 到 Office

1. 打开 Word/Excel/PPT
2. 插入 > 获取加载项 > 管理我的加载项
3. 上载我的加载项
4. 选择 manifest 文件:
   - `services/office-addin/manifest-word.xml`
   - `services/office-addin/manifest-excel.xml`
   - `services/office-addin/manifest-ppt.xml`

## SSL 证书

Office Add-in 必须使用 HTTPS。

证书位置: `docker/office-addin/certs/`

**MacOS 信任证书:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt
```

**Windows 信任证书:**
1. 双击 `server.crt`
2. 安装证书 > 本地计算机
3. 受信任的根证书颁发机构

## 开发模式

源码挂载支持热更新:
```yaml
volumes:
  - ../services/office-addin/src:/app/src
```

修改源码后自动刷新。

## 停止服务

```bash
docker-compose down

# 清理数据
docker-compose down -v
```

## 目录结构

```
docker/
├── docker-compose.yml      # 统一编排
├── start.sh                # 启动脚本
├── carbone-official/       # Carbone API
│   ├── Dockerfile.community
│   ├── carbone-server.js
│   └── templates/
└── office-addin/           # Office Add-in
    ├── Dockerfile.dev      # 开发镜像
    ├── Dockerfile          # 生产镜像
    ├── nginx.conf          # nginx 配置
    ├── generate-certs.sh   # 证书生成
    └── certs/              # SSL 证书
```