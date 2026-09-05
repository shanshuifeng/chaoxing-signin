/**
 * [定制功能] 容器启动自动监听守护脚本
 *
 * 流程：
 *  1. 等待后端接口 (127.0.0.1:5000) 就绪
 *  2. 读取 /app/auto-monitor.json 中的账号配置
 *  3. 调用 /login 获取新鲜凭据（每次启动都重新登录，避免 cookie 过期）
 *  4. 调用 /monitor/start/:phone 拉起监听子进程（与网页端开关状态保持一致）
 *  5. 每60秒自检监听状态，掉线自动重新登录并重启监听
 *
 * 定位/延时等参数全部来自 auto-monitor.json，修改后重启容器即可生效。
 */
const fs = require('fs');
const API = 'http://127.0.0.1:5000';
const CONFIG_PATH = '/app/auto-monitor.json';
const RESTART_DELAY_ON_AUTHFAIL_MS = 5 * 60 * 1000; // 登录失败后重试间隔
const WATCH_INTERVAL_MS = 60 * 1000;                // 监听状态自检间隔

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('[自动监听] 无法读取配置文件 /app/auto-monitor.json：', e.message);
  process.exit(1);
}

const phone = cfg.phone;
const password = cfg.password;
const delaySec = Number(cfg.delay) || 0;
const loc = cfg.location || {};
const LOCATION_PRESET = {
  lon: String(loc.lon || ''),
  lat: String(loc.lat || ''),
  address: loc.address || '',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServeReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/`);
      if (r.ok) return true;
    } catch (e) { /* 未就绪，继续等待 */ }
    await sleep(2000);
  }
  return false;
}

async function login() {
  const r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const text = await r.text();
  try {
    return JSON.parse(text); // 成功：凭据对象
  } catch (e) {
    return text;             // 失败：'AuthFailed' 等文本
  }
}

function buildStartPayload(params) {
  const payload = {
    credentials: {
      phone,
      uf: params.uf,
      _d: params._d,
      vc3: params.vc3,
      uid: params._uid,
      lv: params.lv,
      fid: params.fid,
    },
    config: {
      monitor: {
        delay: delaySec,
        lon: LOCATION_PRESET.lon,
        lat: LOCATION_PRESET.lat,
        presetAddress: [LOCATION_PRESET],
      },
      mailing: { enabled: false },
      cqserver: { cq_enabled: false },
    },
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

async function startMonitor() {
  const params = await login();
  if (typeof params !== 'object' || params === null || !params.uf) {
    console.error(`[自动监听] 登录失败（${params}），${RESTART_DELAY_ON_AUTHFAIL_MS / 60000} 分钟后自动重试。请检查 auto-monitor.json 的账号密码`);
    return false;
  }
  console.log(`[自动监听] 登录成功：${params.name || phone}，启动监听（延时 ${delaySec}s，定位：${LOCATION_PRESET.address}）`);
  try {
    const r = await fetch(`${API}/monitor/start/${phone}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: buildStartPayload(params),
    });
    const res = await r.json();
    if (res.code === 200) {
      console.log('[自动监听] 监听已启动 ✔（IM实时推送已连接，检测到签到将自动签到）');
      return true;
    }
    console.error(`[自动监听] 启动失败：${res.msg}（code ${res.code}）`);
    return false;
  } catch (e) {
    console.error('[自动监听] 启动请求异常：', e.message);
    return false;
  }
}

async function main() {
  console.log('==============================================');
  console.log('[自动监听] 守护脚本已启动');
  console.log(`[自动监听] 监听账号：${phone}`);
  console.log(`[自动监听] 签到延时：检测到签到后 ${delaySec} 秒自动签到`);
  console.log(`[自动监听] 预设定位：${LOCATION_PRESET.address}（${LOCATION_PRESET.lon}, ${LOCATION_PRESET.lat}）`);
  console.log('[自动监听] 拍照签到：依赖超星云盘根目录 0.jpg/0.png，缺失时将主动提醒并等待上传');
  console.log('==============================================');

  if (!(await waitServeReady())) {
    console.error('[自动监听] 后端接口迟迟未就绪，退出');
    process.exit(1);
  }
  console.log('[自动监听] 后端接口就绪');

  let started = await startMonitor();
  // 守护循环：监听掉线（IM断开/进程退出）自动重连
  for (;;) {
    await sleep(WATCH_INTERVAL_MS);
    try {
      const r = await fetch(`${API}/monitor/status/${phone}`);
      const s = await r.json();
      if (s.code !== 200) {
        console.warn(`[自动监听] 检测到监听未运行（${s.msg}），自动重启...`);
        started = await startMonitor();
        if (!started) await sleep(RESTART_DELAY_ON_AUTHFAIL_MS - WATCH_INTERVAL_MS > 0 ? RESTART_DELAY_ON_AUTHFAIL_MS - WATCH_INTERVAL_MS : 0);
      }
    } catch (e) {
      console.warn('[自动监听] 状态自检异常：', e.message);
    }
  }
}

main();
