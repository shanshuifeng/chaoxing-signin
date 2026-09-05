# 配置项说明

## 一、运行配置 `auto-monitor.json`（挂载进容器，改后 `docker compose restart` 生效）

该文件控制**自动监听守护脚本**的行为，含敏感信息，已被 `.gitignore` 排除。
模板见 `auto-monitor.example.json`。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `phone` | string | ✅ | 学习通手机号（登录账号） |
| `password` | string | ✅ | 学习通密码 |
| `delay` | number | ✅ | 签到延时（秒），检测到签到后延迟该时长再签到；**支持小数**，如 `0.75` 表示 750ms |
| `location.lon` | string | ✅ | 预设经度（位置签到使用，教师端可见） |
| `location.lat` | string | ✅ | 预设纬度 |
| `location.address` | string | ✅ | 预设详细地址文本（教师端显示），建议从[百度坐标拾取系统](https://api.map.baidu.com/lbsapi/getpoint/index.html)获取经纬度 |

示例：

```json
{
  "phone": "13700000000",
  "password": "your-password",
  "delay": 0.75,
  "location": {
    "lon": "115.938187",
    "lat": "28.6839",
    "address": "江西省南昌大学青山湖区北区软件学院软件楼"
  }
}
```

## 二、容器编排 `docker-compose.yml`

| 配置 | 说明 |
| --- | --- |
| `build: ./src` | 使用 `src/` 内定制源码构建镜像 `chaoxing-signin:custom` |
| `restart: unless-stopped` | Docker 引擎运行时容器自动拉起 |
| 端口 `9000:80` | HTTP 页面入口 |
| 端口 `9443:443` | HTTPS 页面入口（推荐） |
| 端口 `5000:5000` | 后端 API 直连（仅调试） |
| 挂载 `./auto-monitor.json → /app/auto-monitor.json` | 自动监听配置（只读） |
| 挂载 `./certs/*.crt|.key → /etc/nginx/certs/` | HTTPS 证书 |

## 三、镜像内进程结构（`src/Dockerfile` CMD）

```
nginx（80/443，静态页面 + /api 反向代理）
  └── node apps/server/build/serve.js   # 后端 API（后台运行）
  └── node auto-monitor.js              # [前台守护] 登录 → 拉起监听 → 每分钟自检掉线重连
```

## 四、监听签到行为参数（源码内固定值，修改需重新构建）

| 参数 | 位置 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 状态自检间隔 | `src/auto-monitor.js` `WATCH_INTERVAL_MS` | 60s | 监听掉线后多快自动重连 |
| 登录失败重试间隔 | `src/auto-monitor.js` `RESTART_DELAY_ON_AUTHFAIL_MS` | 5min | 密码错误等情况下下次重试时间 |
| 拍照等待时长 | `src/apps/server/src/monitor.ts` `ensurePhotoObjectId()` | 40 次 × 15s = 10min | 缺图提醒后等待云盘上传的时长 |
| IM 心跳 | `src/apps/server/src/monitor.ts` `WebIMConfig.heartBeatWait` | 4500ms | 环信 IM 长连接心跳 |
| 监听仅签 2 小时内活动 | `src/apps/server/src/monitor.ts`（原项目逻辑） | 2h | 节约资源，过旧活动不签 |

## 五、HTTPS 证书（`certs/`）

| 文件 | 说明 | 是否提交仓库 |
| --- | --- | --- |
| `ca.crt` | 本地 CA 证书（公开可分发） | ❌ 已忽略（可重新生成） |
| `ca.key` | CA 私钥（**绝不可泄露**，签发后建议立即删除） | ❌ 已忽略 |
| `localhost.crt` | 服务器证书（SAN：localhost / 127.0.0.1） | ❌ 已忽略 |
| `localhost.key` | 服务器私钥 | ❌ 已忽略 |

生成方式见 [DEPLOYMENT.md](DEPLOYMENT.md#https-证书)。
