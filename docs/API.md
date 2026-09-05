# API 接口文档

后端为 Koa 服务（源码 `src/apps/server/src/serve.ts`），生产环境通过 nginx 同源代理访问：

- **页面同源地址**：`https://localhost:9443/api/<path>`（推荐，HTTP 下为 `http://localhost:9000/api/<path>`）
- **直连地址（仅调试）**：`http://localhost:5000/<path>`

## 通用约定

- 请求体均为 `application/json`（`/monitor/start` 除外，为 base64 纯文本）
- 用户身份通过**登录返回的凭据**（`_uid` / `_d` / `vc3` / `uf` / `fid` / `lv`）标识，前端登录后保存在浏览器 IndexedDB
- 凭据过期时接口统一返回字符串 `'AuthFailed'`（HTTP 200）
- 网络异常时前端封装层返回字符串 `'NetworkError'`

## 1. 登录

```
POST /login
Content-Type: application/json

{ "phone": "手机号", "password": "密码" }
```

**返回**（成功）：凭据对象，主要字段：

```json
{
  "_uid": "用户ID", "_d": "...", "vc3": "...", "uf": "...",
  "fid": "学校ID", "lv": "...", "name": "姓名"
}
```

**返回**（失败）：`"AuthFailed"`

## 2. 我的课程 `[定制新增]`

```
POST /courses
{ "uid": "<_uid>", "_d": "<_d>", "vc3": "<vc3>" }
```

**返回**（成功）：课程数组，按凭据所属用户过滤：

```json
[
  {
    "courseId": "266476367",
    "classId": "153005793",
    "name": "【26秋】软件项目管理",
    "className": "软件工程[2409-2410]班",
    "image": "https://p.ananas.chaoxing.com/...jpg",
    "teacher": "程伟根",
    "studentCount": 65,
    "cpi": "414207321",
    "state": 0
  }
]
```

**返回**（失败）：`"AuthFailed"` | `"ParseError"` | `"NetworkError"`

## 3. 检测签到活动

```
POST /activity
{ "uid": "...", "_d": "...", "vc3": "...", "uf": "..." }
```

**返回**：进行中的签到活动对象（近 2 小时内最新一条）：

```json
{ "name": "活动名", "activeId": 123, "courseId": 456, "classId": 789, "otherId": 0, "ifphoto": 1 }
```

`otherId` 含义：`0` 普通(拍照) `1` 拍照 `2` 二维码 `3` 手势 `4` 位置 `5` 签到码

**返回**（失败）：`"NoActivity"` | `"NoCourse"` | `"AuthFailed"`

## 4. 签到类接口

以下接口的公共参数均为凭据 + 活动信息：

```
POST /general   { name, fid, uid, activeId, uf, _d, vc3 }                      # 普通/手势/签到码
POST /location  { uf, _d, vc3, name, uid, lat, lon, fid, address, activeId }   # 位置签到
POST /photo     { uf, _d, vc3, name, uid, objectId, activeId, fid }            # 拍照签到（objectId 来自云盘）
POST /qrcode    { name, fid, uid, activeId, uf, _d, vc3, enc, lat, lon, address, altitude }  # 二维码签到（enc 必填）
```

**返回**：`"success"` 或错误描述文本。

## 5. 素材辅助接口

| 接口 | 方式 | 说明 |
| --- | --- | --- |
| `/uvtoken` | POST `{ uid, _d, vc3, uf }` | 获取超星云盘 token |
| `/upload` | POST multipart/form-data（`file` 字段） | 上传照片到云盘，返回 `objectId` |
| `/qrocr` | POST multipart/form-data（图片 base64） | 腾讯云 OCR 识别二维码，返回 `enc`（需在 `apps/server/src/env.json` 配置密钥） |

## 6. 监听模式（供网页端"开始/停止监听"与 auto-monitor.js 守护脚本使用）

### 查询状态

```
GET /monitor/status/:phone
→ { "code": 200, "msg": "Monitoring" }   监听中
  { "code": 201, "msg": "Suspended" }    未监听
  { "code": 202, "msg": "Authencation Failed" }  登录失败
  { "code": 203, "msg": "Not Configured" }       未配置
```

### 启动监听

```
POST /monitor/start/:phone
Content-Type: text/plain
Body: base64( UTF8( JSON ) )

JSON 结构：
{
  "credentials": { "phone", "uf", "_d", "vc3", "uid", "lv", "fid" },
  "config": {
    "monitor": { "delay": 0.75, "lon": "...", "lat": "...", "presetAddress": [{ "lon", "lat", "address" }] },
    "mailing": { "enabled": false },
    "cqserver": { "cq_enabled": false }
  }
}

→ { "code": 200, "msg": "Started Successfully" }  成功（serve 进程内 fork monitor.js 子进程）
  { "code": 202, "msg": "Authencation Failed" }   IM 登录失败
  { "code": 203, "msg": "Not Configured" }        配置缺失
```

> 定制版中 `auto-monitor.js` 会在容器启动与自检时自动调用该接口，无需手动操作。

### 停止监听

```
POST /monitor/stop/:phone
→ { "code": 201, "msg": "Suspended" }
```

## 7. 监听子进程的自动签到行为（非接口，供维护参考）

监听进程通过环信 IM 长连接接收老师发起的签到推送，流程：

1. 收到推送 → 等待 `config.monitor.delay` 秒（定制配置 0.75s）
2. 预签（preSign）→ 按活动类型调用对应签到函数
3. **拍照签到**：云盘根目录无 `0.jpg`/`0.png` 时，控制台 + 超星 IM 双通道提醒上传，每 15s 轮询（最长 10 分钟），检测到上传后自动完成；超时放弃
4. 二维码签到无法全自动（enc 动态），提示人工干预
5. 结果可通过邮件（`mailing`）或 QQ 机器人（`cqserver`）推送，默认关闭
