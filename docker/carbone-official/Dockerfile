# Carbone Official Docker
# 使用官方 carbone-ee-docker 镜像，不定制化

FROM carboneio/carbone-ee:latest

# 设置环境变量
ENV CARBONE_API_PORT=3100
ENV CARBONE_LIBREOFFICE_PORT=2002
ENV CARBONE_ACCESS_KEY=your-access-key

# 暴露端口
EXPOSE 3100

# 启动 Carbone 服务
CMD ["node", "/app/carbone-server.js"]