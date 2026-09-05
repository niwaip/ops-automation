FROM node:22-bookworm-slim

LABEL maintainer="Ops Automation Team"
LABEL description="Standardized Personal User Sandbox with Immutable Runtime & Non-root Isolation"

# 1. 安装基础工具、Python 3、Git 与核心编译环境
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    ripgrep \
    jq \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    zsh \
    bash \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. 全局安装 pnpm 与 modsearch 联网套件
RUN npm install -g pnpm @liustack/modsearch || npm install -g --registry=https://registry.npmmirror.com pnpm @liustack/modsearch

# 3. 创建集中式不可变系统插件库、技能库与默认配置
RUN mkdir -p /opt/dsh/plugins /opt/dsh/skills /etc/dsh \
    && chmod 755 /opt/dsh/plugins /opt/dsh/skills /etc/dsh

# 4. 创建非 root 安全沙箱用户 (UID 1001)
RUN groupadd -g 1001 sandbox \
    && useradd -u 1001 -g sandbox -m -s /bin/bash sandbox

# 5. 创建用户工作区、知识空间挂载点与默认 DSH 配置
RUN mkdir -p /workspace /knowledge /home/sandbox/.dsh \
    && chown -R sandbox:sandbox /workspace /home/sandbox \
    && chown root:root /knowledge /opt/dsh \
    && chmod 755 /workspace /knowledge /opt/dsh/plugins /opt/dsh/skills

# 写入管理员预置的不可变 DSH 基础配置模板（指向内部代理网关）
RUN cat <<'EOF' > /home/sandbox/.dsh/config.json
{
  "managedBy": "Ops Automation Platform",
  "immutable": true,
  "pluginDirectories": ["/opt/dsh/plugins"],
  "skillDirectories": ["/opt/dsh/skills"],
  "model": {
    "provider": "deepseek",
    "useInternalProxy": true
  }
}
EOF
RUN chown -R sandbox:sandbox /home/sandbox/.dsh

# 6. 配置环境变量
ENV USER_MODE=personal \
    WORKSPACE=/workspace \
    KNOWLEDGE_DIR=/knowledge \
    DSH_PLUGIN_DIR=/opt/dsh/plugins \
    DSH_SKILL_DIR=/opt/dsh/skills \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONIOENCODING=utf-8 \
    NODE_ENV=development \
    HOME=/home/sandbox

WORKDIR /workspace

# 7. 拷贝不可变 DSH 运行底座、管理员认证插件与技能模版库
COPY docker/user-sandbox/dsh /usr/local/bin/dsh
RUN chmod 755 /usr/local/bin/dsh

COPY docker/user-sandbox/plugins/ /opt/dsh/plugins/
RUN chmod 755 /opt/dsh/plugins/*.py 2>/dev/null || true

COPY docker/user-sandbox/skills/ /opt/dsh/skills/
RUN chmod -R 755 /opt/dsh/skills 2>/dev/null || true

# 8. 拷贝入口脚本并设置权限
COPY docker/user-sandbox/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 切换为普通非 root 用户，严防篡改系统运行时环境
USER sandbox

EXPOSE 3000 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD []
