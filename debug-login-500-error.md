# Debug Session: login-500-error [OPEN]

## 用户症状
- 登录系统时报错：`Request failed with status code 500`
- 用户要求：查看原因，停止所有服务，并使用 Docker 脚本重启服务

## 当前假设
- H1: `auth` 或其依赖服务（`platform` / `postgres` / `redis`）未启动或启动异常，导致登录接口内部返回 500。
- H2: 后端服务已启动，但数据库连接、迁移状态或关键环境变量异常，登录流程访问数据库时报 500。
- H3: 网关/前端请求的登录目标服务地址错误或容器网络异常，导致代理层返回 500。
- H4: 某个近期改动引发非登录模块启动失败，进而影响统一后端依赖，导致登录时报 500。
- H5: 容器存在脏状态或旧容器/孤儿容器冲突，重启后可恢复。

## 调试计划
- 收集当前容器状态与日志
- 定位登录相关服务异常栈
- 停止所有服务
- 通过仓库规定脚本重启服务
- 验证关键服务健康状态与登录链路入口

## 结果记录
- 证据 1: `docker ps` 显示应用容器仍在运行，但 `ops-postgres` / `ops-redis` 未在当前运行列表中。
- 证据 2: `docker inspect ops-postgres` 返回 `no such object: ops-postgres`，确认数据库容器对象已不存在。
- 证据 3: `docker logs ops-platform` 显示登录接口在 `auth.service.ts` 查询用户时失败：
  - `Can't reach database server at postgres:5432`
  - 触发点：`AuthService.login` 与 `AuthService.refresh`
- 结论:
  - H1 成立：登录依赖服务缺失。
  - H2 成立：数据库连接不可达直接导致 500。
  - H3 暂无证据支持，代理层不是主因。
  - H4 暂无证据支持，主因不是业务代码异常。
  - H5 成立：存在明显脏状态，应用容器与基础设施容器生命周期不一致。
- 处置:
  - 已执行 `./docker/start-smart.sh docker-compose.base.yml down --remove-orphans`
  - 已执行 `./docker/start-smart.sh docker-compose.base.yml up -d`
  - 重启后 `ops-postgres` / `ops-redis` healthy，`ops-platform` / `ops-portal` 已重新启动
  - 使用 `POST http://127.0.0.1:3001/auth/login` 以错误账号验证，返回 `401 Invalid username or password`，确认接口已不再返回 500
