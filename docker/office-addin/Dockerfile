# Office Add-in Docker
# 构建并提供静态文件服务，支持 HTTPS（Office Add-in 要求）

FROM node:18-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json* ./
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# 生产阶段 - 使用 nginx 提供 HTTPS 服务
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置（支持 HTTPS）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制 SSL 证书（开发环境使用自签名证书）
COPY certs/ /etc/nginx/certs/

# 暴露端口
EXPOSE 443

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]