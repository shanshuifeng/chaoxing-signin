# 部署与运行

## 环境要求

- Docker 20+ 与 Docker Compose v2（`docker compose` 或 `docker-compose` 均可）
- 可访问外网（构建镜像需拉取依赖；运行时需能访问 `*.chaoxing.com`）

## 首次部署

```bash
# 1. 准备运行配置
cp auto-monitor.example.json auto-monitor.json
#    编辑 auto-monitor.json：填入手机号、密码、签到延时、预设定位

# 2. （推荐）生成 HTTPS 证书 —— 详见下文“HTTPS 证书”

# 3. 构建并启动
docker compose up -d --build
#    或旧版：docker-compose up -d --build

# 4. 确认运行状态
docker compose ps
docker logs -f chaoxing-signin
#    看到 “监听已启动 ✔（IM实时推送已连接）” 即部署成功
```

## 访问地址

| 地址 | 说明 |
| --- | --- |
| `https://localhost:9443` | **推荐**。HTTPS，页面与接口同源，兼容性最好 |
| `http://localhost:9000` | HTTP 备用入口 |
| `http://localhost:5000` | 后端 API 直连端口（仅调试用，页面不依赖它） |

### HTTPS 证书

- 证书为本地 CA（`certs/ca.crt`）签发的 `localhost` 证书（SAN 含 `localhost` 与 `127.0.0.1`，有效期 10 年）
- 首次访问 `https://localhost:9443` 浏览器会提示不受信任，两种解决方式：
  1. **安装本地 CA（一次性，推荐）**：双击 `certs/ca.crt` → 安装证书 → 当前用户 → “将所有的证书都放入下列存储” → 选择 **受信任的根证书颁发机构** → 完成
  2. 临时绕过：警告页点击 “高级 → 继续访问 localhost(不安全)”
- 重新生成证书：

```bash
cd certs
openssl req -x509 -newkey rsa:2048 -keyout ca.key -out ca.crt -days 3650 -nodes -subj "/CN=ChaoxingSignin Local CA"
openssl req -newkey rsa:2048 -keyout localhost.key -out localhost.csr -nodes -subj "/CN=localhost"
printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n" > ext.cnf
openssl x509 -req -in localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out localhost.crt -days 3650 -extfile ext.cnf
rm -f localhost.csr ext.cnf ca.key ca.srl
docker compose restart
```

## 日常运维

```bash
docker compose start     # 启动（Docker Desktop 启动后若设置了 restart 策略会自动拉起）
docker compose stop      # 停止
docker compose restart   # 重启（修改 auto-monitor.json 后执行，配置即生效）
docker compose down      # 停止并移除容器
docker compose up -d --build   # 修改源码后重建镜像并启动
```

> 说明：容器设置了 `restart: unless-stopped`，只要 Docker 引擎在运行，容器会自动拉起；
> 启动时守护脚本会自动登录账号并开启监听，无需人工操作。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 登录提示“登陆失败” | 账号密码错误，或账号需要图形验证码；检查 `auto-monitor.json` |
| 自动监听反复重启 | 登录失败（密码变更）或网络不通；查看 `docker logs chaoxing-signin` 中 `[自动监听]` 日志 |
| 页面功能缺失 / 界面是旧版 | 浏览器缓存；`Ctrl+F5` 强制刷新（已配置 index.html 禁缓存，新版不会再出现） |
| 位置签到教师端地址不对 | 检查 `auto-monitor.json` 的 `location` 字段并 `docker compose restart` |
| 拍照签到超时放弃 | 10 分钟内未在超星云盘根目录上传 `0.jpg`/`0.png`；重新触发或手动签 |

## 安全注意事项

- `auto-monitor.json` 含学习通账号密码，**严禁提交到公开仓库**（已在 `.gitignore` 中排除）
- `certs/localhost.key`、`certs/ca.key` 为私钥，仅保存在本地（已在 `.gitignore` 中排除）
- 建议 `auto-monitor.json` 使用独立的专用密码
