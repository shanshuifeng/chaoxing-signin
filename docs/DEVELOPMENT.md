# 开发维护约定

## 一、技术栈与架构

```
浏览器 (React 18 + Material UI + React Router)
   │  同源请求 /api/*
   ▼
nginx（80/443，静态资源 + 反向代理）
   │  proxy_pass → 127.0.0.1:5000
   ▼
Koa API 服务（serve.js，Node 19 / Alpine 容器）
   │  child_process.fork
   ▼
monitor.js 监听子进程（环信 IM 长连接 + 签到执行 + 提醒推送）
   │
   ▼
超星学习通 Web 接口（HTTP 模拟登录/签到）、超星云盘、环信 IM
```

- 仓库采用 [Turborepo](https://turbo.build/repo) + pnpm workspace：`apps/web`（前端）、`apps/server`（后端）、`packages/*`（共享包）
- 前端构建产物 `apps/web/dist` 由 nginx 托管；后端 TypeScript 编译产物在 `apps/server/build`

## 二、开发环境

```bash
cd src
pnpm install          # Node >= 18
pnpm dev              # 前后端开发模式（注意：开发模式前端仍走 /api，需本地代理或直改 baseUrl）
pnpm build            # 构建前端 + 转译后端
pnpm start            # 命令行手动签到
pnpm serve            # 仅启动后端接口
pnpm monitor          # 命令行交互式监听（与 Docker 守护脚本等效，带交互配置）
turbo run lint        # 代码检查
```

> 生产部署一律通过 Docker：`docker compose up -d --build`（修改源码后必须重建镜像）。

## 三、代码修改约定

1. 所有针对原项目的定制改动，在代码注释中以 `[定制功能]` / `[定制]` 标记，并在 `README.md` "定制内容" 章节登记
2. 涉及行为参数（轮询间隔、等待时长等）优先提取为常量并集中放置，禁止散落魔法数字
3. 新增接口必须同步更新 `docs/API.md`；新增配置必须同步更新 `docs/CONFIGURATION.md`
4. 提交信息使用约定式前缀：`feat: / fix: / docs: / chore: / refactor:`
5. 改动后验证清单：
   - `docker compose up -d --build` 构建无错误
   - `docker logs chaoxing-signin` 出现 `[自动监听] 监听已启动 ✔`
   - `GET /monitor/status/:phone` 返回 200
   - 页面登录、我的课程、开始签到三项冒烟通过

## 四、敏感信息红线

- `auto-monitor.json`（含账号密码）**禁止提交**
- `certs/` 下私钥（`localhost.key`、`ca.key`）**禁止提交**
- 代码与文档中不得出现真实手机号、密码、cookie 凭据

## 五、通信协议说明

### 1. 与超星学习通的交互（HTTP）

- 登录：`POST http://passport2.chaoxing.com/fanyalogin`，密码使用 DES 加密（密钥为超星网页端公开密钥 `u2oh6Vu^HWe40fj`）
- 课程列表：`https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1`（JSON，含封面与教师信息）
- 签到相关：`mobilelearn.chaoxing.com`（preSign / stuSignajax）、`pan-yz.chaoxing.com`（云盘 token 与上传）
- 请求均携带用户 cookie（`_uid` / `_d` / `vc3`），服务端仅做转发与拼装，**不存储任何用户凭据**

### 2. 与环信 IM 的交互（自动监听）

- 使用学习通 App 同款环信账号体系（appkey `cx-dev#cxstudy`，WebSocket：`im-api-vip6-v2.easecdn.com`）
- 老师发起签到 → 超星通过 IM 通道推送课程附件消息 → 监听进程解析 `message.ext.attachment.att_chat_course` 获取活动 ID → 按 `delay` 延时后自动签到
- 该通道为实时推送，感知延迟为毫秒级，无需轮询

### 3. 容器内部协议

- `nginx :80/:443` → `proxy_pass http://127.0.0.1:5000/`（前缀 `/api` 剥离）
- `serve.js` → `child_process.fork('monitor.js', ['--auth', phone, base64Config])`，父进程通过 IPC 接收 `success / authfail / notconfigured` 消息
- `auto-monitor.js` 守护脚本通过 HTTP 自调 `127.0.0.1:5000` 完成登录与监听管理

## 六、许可与致谢

- 原项目 [cxOrz/chaoxing-signin](https://github.com/cxOrz/chaoxing-signin)，许可协议以原仓库 `src/LICENSE` 文件为准
- 本定制版沿用其许可协议向下游传递；引用的第三方 SDK（环信 WebIM、crypto-js 等）版权归各自作者
- 学习通为超星集团产品，本项目与其无任何隶属关系

## 七、免责声明

本项目仅供技术学习与交流，通过本项目加深网络通信、接口编写、交互设计等方面知识的理解。
请勿用于商业用途或大规模自动化场景；使用者应遵守所在学校/平台的规定，因使用本项目产生的
一切后果由使用者自行承担。
