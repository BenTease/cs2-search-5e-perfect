const imgeshost = 'https://oss-arena.5eplay.com/';
const homeHost = 'https://arena.5eplay.com/data/player/';

const WE_idTransfer = 'https://gate.5eplay.com/userinterface/http/v1/userinterface/idTransfer';//uuid获取接口
const WE_home = 'https://gate.5eplay.com/crane/http/api/data/player/home?uuid='; // 用户生涯数据接口
const WE_best_season = 'https://gate.5eplay.com/crane/http/api/data/player/best_season?uuid=';//用户主页数据接口
const WE_macthlist_api = 'https://gate.5eplay.com/crane/http/api/data/match/list';//用户比赛列表接口
const WE_match = 'https://gate.5eplay.com/crane/http/api/data/match/';//对局详细接口
const WE_userData = 'https://gate.5eplay.com/reddot_proxy/http/api/data/player?uuid=';//用户基础数据(账号状态等)
const WE_steamName = 'https://api-client-arena.5eplay.com/api/user/steam_username/';//5E steam获取5e昵称接口
//5E玩家搜索接口（该接口不返回 CORS 头，但支持 JSONP 的 callback 参数，用 <script> 方式即可跨域读取）
const WE_search = 'https://arena.5eplay.com/api/search/player/1/16?keywords=';

//模式映射表
const WE_account_status = {
  '0': '账户正常',
  '-2': '非法行为封禁',
  '-4': '开挂封禁',
  '-5': '作弊关联封禁',
  '-6': '违规行为',
  '-7': '恶意行为',
  '-8': '风险行为'
};

const statusToImageUrl = {
  '-2': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_illegality_ban.png',   // 非法行为
  '-4': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_cheating_ban.png',       // 作弊行为
  '-5': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_cheating_association_ban.png',  // 作弊关联行为
  '-6': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_unlawful_act_ban.png',  // 违规行为
  '-7': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_malicious_act_ban.png',  // 恶意行为
  '-8': 'https://oss-arena.5eplay.com/ya_static/images/personalInfo/ban/player_risk_ban.png'           // 风险行为
};

/* ============================================================
 * 通用请求工具
 * ============================================================ */

/**
 * JSONP 请求：把一个接口当成 <script> 加载，从而绕开浏览器的跨域(CORS)限制。
 * 5E 的搜索接口支持 ?callback=xxx，返回 xxx({...})，这是目前最稳定的调用方式
 * （之前用的 api.allorigins.win 中转服务已经挂掉了，会返回 HTTP 522）。
 */
let __jsonpSeed = 0;
function jsonpRequest(url, options) {
  const opts = options || {};
  const timeout = opts.timeout || 12000;
  const callbackParam = opts.callbackParam || 'callback';

  return new Promise((resolve, reject) => {
    const cbName = `__we5ejsonp_${Date.now()}_${++__jsonpSeed}`;
    const script = document.createElement('script');
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    };

    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err); else resolve(data);
    };

    window[cbName] = (data) => finish(null, data);
    script.onerror = () => finish(new Error('JSONP 请求失败'));
    timer = setTimeout(() => finish(new Error('JSONP 请求超时')), timeout);
    script.src = `${url}${url.indexOf('?') > -1 ? '&' : '?'}${callbackParam}=${cbName}`;
    (document.head || document.documentElement).appendChild(script);
  });
}

/** 带超时的 fetch，避免接口无响应时页面一直转圈 */
function requestJson(url, options, timeout) {
  const opt = Object.assign({ method: 'GET' }, options || {});
  const ms = timeout || 20000;

  return new Promise((resolve, reject) => {
    let timer = null;
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      opt.signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), ms);
    }
    fetch(url, opt)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => { if (timer) clearTimeout(timer); resolve(data); })
      .catch(error => { if (timer) clearTimeout(timer); reject(error); });
  });
}

/** 账号状态数字/字符串 -> 中文描述 */
function getAccountStatusText(status) {
  if (status === null || typeof status === 'undefined' || status === '') return '未知状态';
  return WE_account_status[String(status)] || '未知状态';
}

/* ============================================================
 * 5E接口函数
 * ============================================================ */

/**
 * 按昵称搜索5E玩家。
 * 说明：原实现走 https://api.allorigins.win/get?url=... 中转，该服务已失效(522)，
 * 现在改为 JSONP 直连 5E 官方搜索接口，失败时自动重试并兜底直连。
 */
async function get_player(keyword) {
  const targetLink = `${WE_search}${encodeURIComponent(keyword)}`;

  const attempts = [
    () => jsonpRequest(targetLink, { timeout: 12000 }),
    () => jsonpRequest(targetLink, { timeout: 12000 }),
    () => requestJson(targetLink, {}, 10000)
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const data = await attempts[i]();
      if (data && typeof data === 'object' &&
          ('data' in data || 'errcode' in data || 'success' in data)) {
        return data; // 返回解析后的数据，供后续 .then/await 使用
      }
      console.warn(`⚠️ 第${i + 1}次搜索返回数据结构异常:`, data);
    } catch (error) {
      console.warn(`⚠️ 第${i + 1}次搜索请求失败:`, error);
    }
  }

  showCopyToast('数据请求超时了Q*Q请稍后重试', 'error', 'color: #9E9E9E;');
  console.error('❌ 访问失败：搜索接口连续重试仍不可用');
  return null; // 错误时返回 null，避免后续报错
}

function get_5Ename(steamId) {
  if (!steamId) return Promise.resolve(null);
  const steamNameapi = `${WE_steamName}${steamId}`;
  return requestJson(steamNameapi, {}, 15000)
    .then(postData => {
      return postData && postData.data ? postData.data.username : null;
    })
    .catch(error => {
      return null;
    });
}

/**
 * 通过 SteamID 反查 5E 账号（用于「只给 SteamID 查双平台」）。
 * @returns {Promise<{username:string, avatar:string|null}|null>}
 */
function get_5EUserBySteamId(steamId) {
  if (!steamId) return Promise.resolve(null);
  return requestJson(`${WE_steamName}${steamId}`, {}, 15000)
    .then(postData => {
      const d = postData && postData.data;
      if (!d || !d.username) return null;
      return { username: d.username, avatar: d.avatar || null };
    })
    .catch(error => {
      console.warn('❌ 通过 SteamID 反查 5E 昵称失败：', error);
      return null;
    });
}

function get_uuid(domain) {
  //获取用户uuid
  if (!domain) return Promise.resolve('获取失败');
  const header_ = {
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "zh-cn",
    "authorization": "",
    "content-type": "application/json",
    "sec-ch-ua": "\"Not A(Brand\";v=\"8\", \"Chromium\";v=\"132\", \"Google Chrome\";v=\"132\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "x-ca-key": "5eplay",
    "x-ca-signature": "pm/c+nYSScWXLOYG7WCczBallQAPFsQ+mu3szgvr7xg=",
    "x-ca-signature-headers": "Accept-Language,Authorization",
    "x-ca-signature-method": "HmacSHA256"
  };
  return requestJson(WE_idTransfer, {
    method: 'POST',
    headers: header_,
    body: JSON.stringify({ 'trans': { 'domain': domain } })
  }, 20000)
    .then(PostData => {
      if (PostData && PostData.data && PostData.data.uuid) {
        return PostData.data.uuid;
      }
      console.warn('获取 UUID 数据结构异常:', PostData);
      return '获取失败';
    })
    .catch(error => {
      console.error('❌ 获取 UUID 失败：', error);
      return '获取失败';
    });
}

/**
 * 5E 历史最高段位（最佳赛季）。
 * 返回：{best_season, elo, rank, rating, rws, adr, match_total, win_total, loss_total, tie_total, level_id_9 ...}
 */
function get_best_season(uuid) {
  if (!uuid || uuid === '获取失败') return Promise.resolve(null);
  const url = WE_best_season + encodeURIComponent(uuid);
  return requestJson(url, {}, 20000)
    .then(postData => {
      const d = postData && postData.data;
      if (!d || !d.best_season) return null;
      return d;
    })
    .catch(error => {
      console.error('❌ 获取历史最高赛季失败：', error);
      return null;
    });
}

function get_macthlist(uuid) {
  if (!uuid || uuid === '获取失败') return Promise.resolve(null);
  const params = {
    'match_type': -1,
    'page': 1,
    'date': 0,
    'start_time': 0,
    'end_time': 0,
    'uuid': uuid,
    'limit': 100, // 只需要最近若干场，取第一场即可定位 SteamID，拉全量太慢
    'cs_type': 0,
  };
  const queryString = new URLSearchParams(params).toString();
  const targetUrl = `${WE_macthlist_api}?${queryString}`;
  // 5E 的 game_mode：6=优先排位，24/103=其他排位模式，优先取这些模式的对局
  const preferModes = ['6', '24', '103'];

  return requestJson(targetUrl, { method: 'GET' }, 25000)
    .then(proxydata => {
      const list = proxydata && Array.isArray(proxydata.data) ? proxydata.data : null;
      if (!list || list.length === 0) return null;
      const picked = list.find(item => item && preferModes.indexOf(String(item.game_mode)) > -1);
      if (picked && picked.match_id) return picked.match_id;
      // 没有匹配到指定模式时，用最近一场对局兜底（同样能拿到 SteamID）
      return list[0] && list[0].match_id ? list[0].match_id : null;
    })
    .catch(error => {
      console.error('❌ 获取比赛列表失败：', error);
      return null;
    });
}

function get_home(uuid) {
  if (!uuid || uuid === '获取失败') return Promise.resolve(null);
  const homeURL = WE_home + encodeURIComponent(uuid);
  return requestJson(homeURL, {}, 20000)
    .then(postData => {
      if (postData && postData.data && postData.data.season_data) {
        const seasonData = postData.data.season_data['9'] || postData.data.season_data[9];
        if (seasonData) return seasonData;
      }
      return null;
    })
    .catch(error => {
      console.error('❌ 获取主页数据失败：', error);
      return null;
    });
}

/**
 * 获取玩家基础数据（账号状态、昵称、头像等）。
 * 说明：老接口 /userinterface/pt/v1/userinterface/header/{uuid} 已下线(404)，
 * 新的公开接口是 /reddot_proxy/http/api/data/player?uuid=xxx 。
 * 注册时间、信誉分、违规记录等字段现在只有登录后（userauthinterface/header）才返回，
 * 未登录时这里返回 null，页面会显示“未公开”。
 */
function get_userData(uuid) {
  if (!uuid || uuid === '获取失败') return Promise.resolve(null);
  const userinterfaceUrl = WE_userData + encodeURIComponent(uuid);
  return requestJson(userinterfaceUrl, {}, 20000)
    .then(postData => {
      const inner = postData && postData.data && postData.data.data;
      const user = inner && inner.user;
      if (!user) return null;
      const levelInfo = (inner.data && inner.data.level_info) || inner.level_info || {};
      return {
        account_status: typeof user.account_status === 'undefined' ? null : user.account_status,
        username: user.username || null,
        avatar_url: user.avatar_url || null,
        user_title: user.user_title || null,
        // 以下字段新版公开接口不再返回，保留为 null 以便页面做兜底显示
        reg_date: typeof user.reg_date === 'undefined' ? null : user.reg_date,
        credit_score: typeof user.credit_score === 'undefined' ? null : user.credit_score,
        report_count: typeof user.report_count === 'undefined' ? null : user.report_count,
        match_time_total: typeof user.match_time_total === 'undefined' ? null : user.match_time_total,
        level_info: levelInfo
      };
    })
    .catch(error => {
      console.error('❌ 获取用户状态数据失败：', error);
      return null;
    });
}

function get_steamID(matchId, targetUuid) {
  if (!matchId || !targetUuid || targetUuid === '获取失败') return Promise.resolve(null);
  const targetUrl = `${WE_match}${matchId}`;
  return requestJson(targetUrl, {}, 25000)
    .then(postData => {
      if (!postData || !postData.data) return null;
      const group1 = postData.data.group_1 || [];
      const group2 = postData.data.group_2 || [];
      const group = group1.concat(group2);
      for (let i = 0; i < group.length; i++) {
        const player = group[i];
        if (player && player.user_info && player.user_info.user_data &&
            player.user_info.user_data.uuid === targetUuid &&
            player.user_info.user_data.steam && player.user_info.user_data.steam.steamId) {
          return player.user_info.user_data.steam.steamId;
        }
      }
      return null;
    })
    .catch(error => {
      console.error("❌ 获取 SteamID 失败:", error);
      return null;
    });
}

function get_steamData(steamId) {//获取steam社区数据
  if (!steamId) return Promise.resolve(null);
  const url = `https://download.imagedownloader.online/?url=https://steamrepcn.com/profiles/${steamId}`;

  const parse = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const listContainer = doc.querySelector('div[class="flex w-full justify-between"]');
    const avatarContainer = doc.querySelector('div[class="flex px-5"]');
    const steamNameElement = doc.querySelector('p[class="mb-2 truncate text-4xl font-bold leading-tight"]');
    if (!listContainer || !avatarContainer || !steamNameElement) {
      return null;
    }
    const listText = listContainer.querySelectorAll('div[class="flex flex-col"]');
    const SteamifonData = {};
    SteamifonData['steam_avatar'] = avatarContainer.querySelector('img').src || null;
    SteamifonData['SteamName'] = steamNameElement.getAttribute('title') || null;
    listText.forEach(element => {
      try {
        const mlElement = element.querySelector('p[class="ml-2"]');
        const textElement = element.querySelector('p[class="ml-2 text-gray-400 text-sm"]');
        if (mlElement && textElement) {
          const ml = mlElement.innerText.trim();
          const text = textElement.innerText.trim();
          SteamifonData[ml] = text;
        }
      } catch (e) {}
    });
    return SteamifonData;
  };

  // steamrepcn 的代理偶尔会抽风（超时 / 返回空页），失败重试一次
  const attemptFetch = () => {
    const opt = {};
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 20000);
      opt.signal = ctrl.signal;
    }
    return fetch(url, opt).then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.text();
    });
  };

  return attemptFetch()
    .then(html => parse(html))
    .then(data => {
      if (data) return data;
      throw new Error('Steam 页面解析失败');
    })
    .catch(error => {
      console.warn('⚠️ 获取 Steam 数据失败，1 秒后重试一次:', error && error.message);
      return new Promise(resolve => setTimeout(resolve, 1000))
        .then(attemptFetch)
        .then(html => parse(html))
        .catch(err => {
          console.error('❌ 获取 Steam 数据失败:', err);
          return null;
        });
    });
}

//工具(转换时间戳)
function convertTimestamp(timestamp) {
  if (!timestamp) return "未知";
  const num = Number(timestamp);
  if (!num) return "未知";
  const ms = num.toString().length === 10 ? num * 1000 : num;
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}
