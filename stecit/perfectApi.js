
const modeDict = {
    "全部模式": -1, "天梯组排": -12, "天梯绿色": -120, "官匹pro": 41, "天梯单排": -46, "单排绿色": -460
};

const API_URLS = {
    getInGameUserSetBySid:"https://appactivity.wmpvp.com/steamcn/app/realtime/getInGameUserSetBySid?steamIds=",//获取玩家游戏状态 [在线/离线] [国服/平台]
    SEARCH: "https://appengine.wmpvp.com/steamcn/app/search/user",//完美昵称搜索接口
    ACCOUNTS: "https://appengine.wmpvp.com/steamcn/community/user/getNewUserList",//完美绑定账号关联接口
    FORBID: "https://api.wmpvp.com/api/csgo/home/user/forbid",//玩家封禁状态获取接口
    MATCHES: "https://api.wmpvp.com/api/csgo/home/match/list",//玩家比赛记录数据接口
    STATS: "https://api.wmpvp.com/api/csgo/home/pvp/detailStats",//完美平台数据获取接口
    INVENTORY: "https://gwapi.pwesports.cn/appdecoration/steamcn/csgo/decoration/getSteamInventoryPreview",//玩家CS2饰品库存数据接口
    OFFICIAL_STATS: "https://api.wmpvp.com/api/csgo/home/official/detailStats",//玩家国服数据获取接口
    CSINFO: "https://gwapi.pwesports.cn/appdatacenter/csgo/official/fall/userCsgoInfo",//获取优先状态
    STEAM_DATA: "https://steamrepcn.com/profiles/"//steam社区数据获取接口
};

const mockUserData = [
    { 'steamID': '76561199721184339', 'userID': '1026293222', 'token': '7667e792473259e7e40cd7658b1681a0d2a7ce6c' },
    { 'steamID': '76561199697817037', 'userID': '1022646069', 'token': '8dfa964afe38a638488b66f55b32d601e1a4e79a' },
    { 'steamID': '76561199722026486', 'userID': '1026158310', 'token': '69b506ce5b3be3ba49622305851baf2b72df1ed1'}
];

function getRandomUser() {
    return mockUserData[Math.floor(Math.random() * mockUserData.length)];
}

function getHeaders(token) {
    const headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9",
        "content-type": "application/json",
        "sec-ch-ua": "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "Referer": "https://csgo.wmpvp.com/",
        'appversion': '3.6.2.189',
        'device': 'KGPSz1754474645YpsvmPeeMtb',
        'gameType': '2',
        'gameTypeStr': '2',
        'platform': 'android',
        'appTheme': '0',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip',
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    };
    if (token) headers["token"] = `${token}`;
    return headers;
}

/* ============================================================
 * 5E 段位规则（注意：和完美平台不是一套）
 *   0-1200 D        1201-1350 C     1351-1500 C+    1501-1600 C++
 *   1601-1750 B     1751-1900 B+    1901-2000 B++   2001-2150 A
 *   2151-2300 A+    2301-2400 A++
 *   2400 以上不再看分数，改看星星：0-19 星 S，20-39 星 SS，40 星以上 SSS
 * 区间都是闭区间。
 * ============================================================ */
const WE_RANK_TIERS = [
    { max: 1200, name: 'D' },
    { max: 1350, name: 'C' },
    { max: 1500, name: 'C+' },
    { max: 1600, name: 'C++' },
    { max: 1750, name: 'B' },
    { max: 1900, name: 'B+' },
    { max: 2000, name: 'B++' },
    { max: 2150, name: 'A' },
    { max: 2300, name: 'A+' },
    { max: 2400, name: 'A++' }
];

/** S 段位以上的星级 -> 段位名 */
function weStarRankText(stars) {
    const st = Number(stars) || 0;
    if (st >= 40) return 'SSS';
    if (st >= 20) return 'SS';
    return 'S';
}

/** 5E 是否已经是 S 段位（2401 分及以上） */
function weIsSTier(score) {
    return (Number(score) || 0) > 2400;
}

/**
 * 5E 段位文本
 * @param {number} score 5E 排位分
 * @param {number} stars S 段位的星星数量（只需分数 > 2400 时传）
 */
function getRankText(score, stars) {
    const s = Number(score) || 0;
    if (s <= 0) return '未定级';
    if (s > 2400) return weStarRankText(stars);
    for (let i = 0; i < WE_RANK_TIERS.length; i++) {
        if (s <= WE_RANK_TIERS[i].max) return WE_RANK_TIERS[i].name;
    }
    return '未定级';
}

// 根据分数获取段位颜色
function getRankColor(score, stars) {
    const s = Number(score) || 0;
    if (s <= 0) return "#808080";        // 未定级 - 灰
    if (s <= 1200) return "#4A6CF7";     // D   - 蓝
    if (s <= 1350) return "#5B6CFF";     // C
    if (s <= 1500) return "#7C5CFF";     // C+
    if (s <= 1600) return "#9333EA";     // C++ - 紫
    if (s <= 1750) return "#C41E3A";     // B   - 红
    if (s <= 1900) return "#E03C4F";     // B+
    if (s <= 2000) return "#FF5700";     // B++ - 橙红
    if (s <= 2150) return "#FF7A00";     // A   - 橙
    if (s <= 2300) return "#F9B641";     // A+  - 金橙
    if (s <= 2400) return "#FFB300";     // A++ - 亮金
    return "#FFD700";                    // S / SS / SSS - 金
}

// 根据SteamID搜索完美平台用户信息
async function searchUsers(steamId) {
    if (!steamId || ["N/A", "未知", ""].includes(steamId.toString().trim())) {
        return null;
    }
    try {
        const { token } = getRandomUser();
        const headers = getHeaders(token);
        const response = await fetch(API_URLS.SEARCH, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                keyword: steamId,
                page: 1,
                pageSize: 10,
                searchType: 1 // 1 表示按 SteamID 搜索
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // 检查返回数据结构是否符合预期
        if (data.result) {
            return data.result; // 返回第一个匹配的用户
        }
        return null; // 未找到用户或数据格式不正确
    } catch (e) {
        console.error("搜索完美用户错误:", e);
        return null;
    }
}

// 获取完美平台账号封禁信息
async function getAccountForbidInfo(steamId) {
    if (!steamId) {
        return "未知";
    }
    try {
        const { steamID: mySteamId, token } = getRandomUser();
        const headers = getHeaders(token);

        const response = await fetch(API_URLS.FORBID, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                toSteamId: steamId,
                mySteamId: mySteamId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.statusCode === 0 && data.data) {
            const forbidDetail = data.data;
            if ([0, null, undefined].indexOf(forbidDetail.pwaBanType) === -1) {
                const expireDate = timestampToDate(forbidDetail.expireTime);
                const createDate = timestampToDate(forbidDetail.createTime);
                const desc = forbidDetail.desc || "未说明封禁原因";
                return `存在封禁记录\n封禁原因：${desc}\n封禁时间：${createDate}\n解封时间：${expireDate}`;
            } else {
                return "状态正常";
            }
        } else {
            return `封禁查询失败：${data.errorMessage || '未知错误'}`;
        }
    } catch (e) {
        console.error("获取封禁信息错误:", e);
        return "查询失败";
    }
}

async function getCsInfo(steamId) {
    if (!steamId) {
        return "无法获取优先状态";
    }
    try {
        const { token } = getRandomUser();
        const params = new URLSearchParams({ steamId: steamId, token: token, darkType: '0' });
        const response = await fetch(`${API_URLS.CSINFO}?${params.toString()}`, { method: "GET", headers: getHeaders() });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.result && data.result.levelTitle) {
            return `优先用户 ${data.result.levelTitle}-${data.result.curLevel}级`;
        }
        return "非优先用户";
    } catch (e) {
        console.error("获取CS信息错误:", e);
        return "无法获取优先状态";
    }
}

async function getPvPStats(steamId) {//获取完美数据
    if (!steamId || ["N/A", "未知", ""].includes(steamId.toString().trim())) {
        return null;
    }
    try {
        const { steamID: mySteamId, token } = getRandomUser();
        const headers = getHeaders(token);
        const response = await fetch(API_URLS.STATS, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ toSteamId: steamId, mySteamId: mySteamId, accessToken: token })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.statusCode === 0 && data.data) {
            if (data.data.playTime) {
                data.data.playTimeHours = parseFloat((data.data.playTime / 3600).toFixed(1));
            }
            return data.data;
        }
        return null;
    } catch (e) {
        console.error("获取国服统计错误:", e);
        return null;
    }
}

async function getOfficialStats(steamId) {
    //获取国服数据
    if (!steamId || ["N/A", "未知", ""].includes(steamId.toString().trim())) {
        return null;
    }
    try {
        const { steamID: mySteamId, token } = getRandomUser();
        const headers = getHeaders(token);
        const response = await fetch(API_URLS.OFFICIAL_STATS, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ toSteamId: steamId, mySteamId: mySteamId, accessToken: token })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.statusCode === 0 && data.data) {
            if (data.data.playTime) {
                data.data.playTimeHours = parseFloat((data.data.playTime / 3600).toFixed(1));
            }
            return data.data;
        }
        return null;
    } catch (e) {
        console.error("获取国服统计错误:", e);
        return null;
    }
}

// 获取完美平台比赛数据
async function getAccountMatches(steamId) {
    if (!steamId || ["N/A", "未知", ""].includes(steamId.toString().trim())) {
        return [];
    }
    try {
        const { steamID: mySteamId, token } = getRandomUser();
        const headers = getHeaders(token);
        const response = await fetch(API_URLS.MATCHES, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                mySteamId: mySteamId,
                toSteamId: steamId,
                csgoSeasonId: "recent",
                pvpType: modeDict["全部模式"],
                page: 1,
                pageSize: 9999,
                dataSource: 3
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.statusCode === 0 && data.data && data.data.matchList) {
            return data.data.matchList;
        }
        return [];
    } catch (e) {
        console.error("获取比赛数据错误:", e);
        return [];
    }
}

// 从 searchUsers 的结果中获取最高评分
function getUserMaxScore(perfectUserInfo) {

    if (!perfectUserInfo || !Array.isArray(perfectUserInfo) || perfectUserInfo.length === 0) {
        return "无数据";
    }
    let PvPScore = perfectUserInfo
        .map(Score => Number(Score && Score.pvpScore))
        .filter(score => !isNaN(score) && isFinite(score));
    if (PvPScore.length === 0) {
        return "无数据";
    }
    let MaxScore = Math.max(...PvPScore);
    console.log(MaxScore);
    return MaxScore;
}

// 时间戳转换函数 (原代码中缺失)
function timestampToDate(timestamp) {
    if (!timestamp) return "未知";
    const date = new Date(timestamp);
    return date.toLocaleString();
}

/* ============================================================
 * 以下为「5E × 完美 双平台合并查询」新增的完美平台能力
 * （函数名统一加 pw 前缀或使用新名字，避免影响旧页面）
 * ============================================================ */

/**
 * 按「完美昵称」或「SteamID」搜索完美用户。
 * @param {string} keyword 昵称或 17 位 SteamID
 * @param {boolean} bySteamId true=按 SteamID 精确搜索（searchType:1），false=按昵称搜索
 * @returns {Promise<Array>} 结果数组 [{steamId, pvpNickName, appNickName, pvpAvatar, pvpScore, userId}]
 */
async function pwSearchUser(keyword, bySteamId) {
    const kw = String(keyword || '').trim();
    if (!kw) return [];
    try {
        const { token } = getRandomUser();
        const body = { keyword: kw, page: 1, pageSize: bySteamId ? 10 : 20 };
        if (bySteamId) body.searchType = 1;
        const response = await fetch(API_URLS.SEARCH, {
            method: "POST",
            headers: getHeaders(token),
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && Array.isArray(data.result)) return data.result;
        return [];
    } catch (e) {
        console.error("完美搜索错误:", e);
        return [];
    }
}

/* ============================================================
 * 完美段位规则（和 5E 不是一套，闭区间）
 *   D      <=1000         C      1001-1150     C+     1151-1300
 *   金C+(C++) 1301-1450   B      1451-1600     B+     1601-1750
 *   B++    1751-1900      A      1901-2050     A+     2051-2200
 *   A++    2201-2400      2401 及以上为 S，不再显示分数，改看星星：
 *   青铜S 0-9 星，黄金S 10-24 星，钻石S 25-49 星，魔王S 50 星以上
 * ============================================================ */
const PW_RANK_TIERS = [
    { max: 1000, name: 'D' },
    { max: 1150, name: 'C' },
    { max: 1300, name: 'C+' },
    { max: 1450, name: '金C+' },
    { max: 1600, name: 'B' },
    { max: 1750, name: 'B+' },
    { max: 1900, name: 'B++' },
    { max: 2050, name: 'A' },
    { max: 2200, name: 'A+' },
    { max: 2400, name: 'A++' }
];

/** 完美 S 段位按星星细分 */
function pwStarRankText(stars) {
    const st = Number(stars) || 0;
    if (st >= 50) return '魔王S';
    if (st >= 25) return '钻石S';
    if (st >= 10) return '黄金S';
    return '青铜S';
}

/** 完美是否已经是 S 段位（2401 分及以上） */
function pwIsSTier(pvpScore) {
    return (Number(pvpScore) || 0) > 2400;
}

/** 完美段位文本（S 段位需要传星星数） */
function pwRankText(pvpScore, stars) {
    const s = Number(pvpScore) || 0;
    if (s <= 0) return "未定级";
    if (s > 2400) return pwStarRankText(stars);
    for (let i = 0; i < PW_RANK_TIERS.length; i++) {
        if (s <= PW_RANK_TIERS[i].max) return PW_RANK_TIERS[i].name;
    }
    return "未定级";
}

/** 完美段位颜色 */
function pwRankColor(pvpScore, stars) {
    const s = Number(pvpScore) || 0;
    if (s <= 0) return "#FB7299";
    if (s > 2400) {
        const st = Number(stars) || 0;
        if (st >= 50) return "#F53F3F";     // 魔王S
        if (st >= 25) return "#7DD3FC";     // 钻石S
        if (st >= 10) return "#FFD700";     // 黄金S
        return "#CD7F32";                   // 青铜S
    }
    if (s <= 1000) return "#4A6CF7";    // D
    if (s <= 1150) return "#5B6CFF";    // C
    if (s <= 1300) return "#7C5CFF";    // C+
    if (s <= 1450) return "#9333EA";    // 金C+
    if (s <= 1600) return "#C41E3A";    // B
    if (s <= 1750) return "#E03C4F";    // B+
    if (s <= 1900) return "#FF5700";    // B++
    if (s <= 2050) return "#FF7A00";    // A
    if (s <= 2200) return "#F9B641";    // A+
    return "#FFB300";                   // A++
}

/** 获取该完美用户绑定的所有 Steam 账号 */
async function getUserAccounts(targetUserId) {
    if (!targetUserId) return [];
    try {
        const { token, userID } = getRandomUser();
        const params = new URLSearchParams({
            appId: 2,
            token: token,
            userId: userID,
            toUserId: targetUserId,
            needDouyu: false
        });
        const response = await fetch(`${API_URLS.ACCOUNTS}?${params.toString()}`, {
            method: "GET",
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && data.code === 1 && data.result && Array.isArray(data.result.userList)) {
            return data.result.userList;
        }
        return [];
    } catch (e) {
        console.error("获取绑定账号错误:", e);
        return [];
    }
}

/** 是否正在完美平台游戏中 */
async function getOnlineStatus(steamId) {
    if (!steamId) return { online: false, duration: 0 };
    try {
        const response = await fetch(`${API_URLS.getInGameUserSetBySid}${steamId}`, {
            method: "GET",
            headers: getHeaders()
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && data.code === 1 && data.result) {
            const isOnline = data.result.idSet && data.result.idSet.indexOf(steamId) > -1;
            const duration = (data.result.userRealTimeMap && data.result.userRealTimeMap[steamId]) || 0;
            return { online: !!isOnline, duration };
        }
        return { online: false, duration: 0 };
    } catch (e) {
        console.error("获取在线状态错误:", e);
        return { online: false, duration: 0 };
    }
}

/** 黑产小号刷分检测（与完美成分查询同逻辑） */
function detectBlackAccount(matches) {
    if (!matches || matches.length === 0) {
        return { isBlack: false, details: "无比赛数据，无法检测" };
    }
    const seenStartTimes = [];
    for (const match of matches) {
        const kill = match.kill || 0;
        const assist = match.assist || 0;
        const rating = match.pwRating || 0;
        if (rating <= 0.7 && assist <= 1 && (kill === 0 || kill < 3)) {
            const date = match.startTime ? String(match.startTime).split(" ")[0] : "";
            if (date) seenStartTimes.push(date);
        }
    }
    if (seenStartTimes.length >= 4) {
        const dateCount = {};
        for (const day of seenStartTimes) dateCount[day] = (dateCount[day] || 0) + 1;
        for (const day of Object.keys(dateCount)) {
            if (dateCount[day] >= 3) {
                return { isBlack: true, details: `疑似黑产小号刷分（${day} 当天就有 ${dateCount[day]} 场）` };
            }
        }
    }
    return { isBlack: false, details: "未检测到黑产特征" };
}

/** 最近比赛里的最高完美分 */
function getMaxPvpScoreFromMatches(matches) {
    if (!matches || matches.length === 0) return null;
    let maxScore = 0;
    for (const match of matches) {
        const s = Number(match.pvpScore) || 0;
        if (s > maxScore) maxScore = s;
    }
    return maxScore || null;
}

/** 最近比赛的平均击杀 */
function getAvgKillFromMatches(matches) {
    if (!matches || matches.length === 0) return null;
    let kill = 0, death = 0;
    for (const match of matches) {
        kill += Number(match.kill) || 0;
        death += Number(match.death) || 0;
    }
    return {
        avgKill: parseFloat((kill / matches.length).toFixed(1)),
        avgDeath: parseFloat((death / matches.length).toFixed(1)),
        kd: death > 0 ? parseFloat((kill / death).toFixed(2)) : null
    };
}

/* ---------- 完美历史最高段位（把每个赛季都扫一遍取最高） ---------- */

const PERFECT_SEASON_MAX = 30;        // 完美赛季编号上限（2026 年当前约为 S25，留些余量）
const __perfectBestSeasonCache = {};  // steamId -> Promise

/** 取某一个赛季的天梯数据（seasonId 形如 S24） */
async function getPerfectSeasonStats(steamId, seasonId) {
    const { steamID: mySteamId, token } = getRandomUser();
    const response = await fetch(API_URLS.STATS, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({
            toSteamId: steamId,
            mySteamId: mySteamId,
            accessToken: token,
            csgoSeasonId: seasonId,
            pvpType: -1,
            page: 1,
            pageSize: 3,
            dataSource: 3
        })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data && data.statusCode === 0 && data.data) return data.data;
    return null;
}

/**
 * 完美历史最高段位：并行扫描 S1..S30，取 pvpScore 最高的赛季。
 * 注意：服务端对不存在的赛季会回退成「最近比赛」的数据，所以只认分数 > 0 的赛季。
 * @returns {Promise<{seasonId:string, score:number, data:Object}|null>}
 */
function getPerfectBestSeason(steamId) {
    if (!steamId) return Promise.resolve(null);
    if (__perfectBestSeasonCache[steamId]) return __perfectBestSeasonCache[steamId];

    let cached = null;
    try {
        const raw = sessionStorage.getItem('pw-best-season:' + steamId);
        if (raw) cached = JSON.parse(raw);
    } catch (e) { /* 忽略隐私模式下的异常 */ }
    if (cached && cached.seasonId) {
        __perfectBestSeasonCache[steamId] = Promise.resolve(cached);
        return __perfectBestSeasonCache[steamId];
    }

    const seasons = [];
    for (let i = 1; i <= PERFECT_SEASON_MAX; i++) seasons.push('S' + i);

    const run = (async () => {
        const all = [];
        // 分批发，避免一次性打太多请求
        for (let i = 0; i < seasons.length; i += 10) {
            const chunk = seasons.slice(i, i + 10);
            const part = await Promise.all(chunk.map(async (seasonId) => {
                try {
                    const d = await getPerfectSeasonStats(steamId, seasonId);
                    if (!d) return null;
                    const score = Number(d.pvpScore) || 0;
                    if (score <= 0) return null;                       // 未定级 / 赛季不存在
                    if (d.seasonId && String(d.seasonId) !== seasonId) return null; // 回退数据，丢弃
                    return { seasonId, score, data: d };
                } catch (e) {
                    return null;
                }
            }));
            for (const item of part) if (item) all.push(item);
        }
        if (all.length === 0) return null;
        all.sort((a, b) => b.score - a.score);
        const best = all[0];
        try {
            sessionStorage.setItem('pw-best-season:' + steamId, JSON.stringify(best));
        } catch (e) { /* 超配额就算了 */ }
        return best;
    })();

    __perfectBestSeasonCache[steamId] = run;
    return run;
}