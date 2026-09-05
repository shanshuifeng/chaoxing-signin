# chaoxing-signin 定制版（Docker 部署）

基于开源项目 [cxOrz/chaoxing-signin](https://github.com/cxOrz/chaoxing-signin) 的定制发行版，通过 Docker 一键部署，在原项目基础上新增了 **容器启动自动监听、自定义签到延时、拍照签到缺图提醒、HTTPS 支持、我的课程页面** 等功能。

> ⚠️ 本项目仅供学习交流使用，请勿用于商业用途。使用本工具产生的一切后果由使用者自行承担。

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 手动签到 | 普通 / 拍照 / 手势 / 位置 / 签到码 / 二维码（enc） |
| 自动监听签到 | 容器启动即自动登录并拉起监听（IM 实时推送，毫秒级感知），掉线自动重连 |
| 自定义签到延时 | 检测到签到后延迟指定秒数再签（支持小数，如 0.75s） |
| 固定预设定位 | 位置签到使用配置文件中的预设经纬度与地址 |
| 拍照缺图提醒 | 触发拍照签到但云盘无 0.jpg/0.png 时，控制台 + 超星 IM 双通道提醒，轮询等待上传后自动完成 |
| 我的课程页面 | 登录后查看本人课程列表（名称 / 封面 / 教师 / 人数），未登录自动跳转登录页 |
| HTTPS 支持 | 本地 CA 签发的 localhost 证书，页面与接口同源，无跨域问题 |

## 目录结构

```
chaoxing-signin-docker/
├── src/                        # 定制源码（前端 React+MUI / 后端 Koa / nginx 配置 / Dockerfile）
│   ├── apps/web/               #   前端（React.js + Material UI）
│   ├── apps/server/            #   后端（Node.js + Koa）
│   ├── nginx.conf              #   nginx 配置（HTTPS + /api 同源代理）
│   ├── auto-monitor.js         #   [定制] 自动监听守护脚本
│   └── Dockerfile              #   镜像构建文件
├── auto-monitor.json           # [敏感·勿提交] 自动监听运行配置（账号密码/延时/定位）
├── auto-monitor.example.json   # 配置模板（复制为 auto-monitor.json 后填写）
├── certs/                      # [密钥·勿提交私钥] 本地 CA 与 localhost 证书
├── docker-compose.yml          # 容器编排
└── docs/                       # 文档（部署 / 配置 / API / 开发约定）
```

## 快速开始

```bash
# 1. 准备配置
cp auto-monitor.example.json auto-monitor.json
#    编辑 auto-monitor.json，填入学习通账号密码、签到延时与预设定位

# 2. （可选，HTTPS 需要）生成证书
mkdir -p certs && cd certs
openssl req -x509 -newkey rsa:2048 -keyout ca.key -out ca.crt -days 3650 -nodes -subj "/CN=ChaoxingSignin Local CA"
openssl req -newkey rsa:2048 -keyout localhost.key -out localhost.csr -nodes -subj "/CN=localhost"
printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n" > ext.cnf
openssl x509 -req -in localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out localhost.crt -days 3650 -extfile ext.cnf
rm -f localhost.csr ext.cnf ca.key

# 3. 构建并启动
docker-compose up -d --build

# 4. 访问
#    推荐地址：https://localhost:9443 （首次访问需信任本地证书，详见 docs/DEPLOYMENT.md）
#    备用地址：http://localhost:9000
```

启动后自动监听守护脚本会立即登录配置的账号并拉起监听，无需人工干预。查看运行日志：

```bash
docker logs -f chaoxing-signin
```

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署与运行方式、HTTPS 证书、常见问题 |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | 全部配置项说明 |
| [docs/API.md](docs/API.md) | 后端 API 接口定义（请求方式 / 参数 / 返回格式） |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发维护约定、架构说明、通信协议与免责声明 |

## 定制内容相对原项目的改动

1. `src/apps/server/src/monitor.ts`：新增 `ensurePhotoObjectId()`（拍照缺图提醒 + 轮询等待）、监听启动说明日志
2. `src/apps/server/src/functions/user.ts`：新增 `getMyCourses()`（backclazzdata 课程 JSON 接口解析）
3. `src/apps/server/src/serve.ts`：新增 `POST /courses` 路由
4. `src/auto-monitor.js`：新增容器启动守护脚本（自动登录、拉起监听、掉线自愈）
5. `src/Dockerfile`：CMD 改为 nginx + serve.js + auto-monitor.js 三进程结构
6. `src/nginx.conf`：新增 HTTPS 监听、`/api/` 同源代理、index.html 禁缓存
7. `src/apps/web/src/pages/MyCourses/`：新增"我的课程"页面
8. `src/apps/web/src/config/api.ts`：接口地址改为同源 `/api`
9. `src/apps/web/src/utils/request.ts`：请求失败统一返回 `NetworkError`（原版会静默挂起）
