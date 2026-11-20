/* ============================================================
 * 5E × 完美 双平台查成分
 * 特性：
 *  1. 两个按钮切换「用 5E 昵称查」/「用完美昵称查」；
 *  2. 输入 76 开头 17 位 SteamID 时，直接同时查两个平台；
 *  3. 三个平台（5E / 完美 / Steam）各自独立请求，查到哪个就先渲染哪个。
 * ============================================================ */
(function () {
    'use strict';

    const IMG_HOST = 'https://oss-arena.5eplay.com/';   // 5E 头像前缀
    const STEAM_ID_RE = /^76\d{15}$/;                    // 76 开头共 17 位

    const state = {
        mode: '5e',    // '5e' | 'perfect'
        seq: 0,        // 查询序号，用于丢弃过期请求的结果
        steamId: null,
        card: null
    };

    const $ = (id) => document.getElementById(id);

    /* ------------------------- 小工具 ------------------------- */

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = text;
        return n;
    }

    /** 数字格式化：0 / 非法值返回 null（渲染时会被跳过） */
    function num(v, digits) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!isFinite(n) || n === 0) return null;
        return digits === undefined ? String(n) : n.toFixed(digits);
    }

    /** 比例转百分比：0.72 -> 72.0% */
    function pct(v, digits) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!isFinite(n)) return null;
        return (n <= 1 ? n * 100 : n).toFixed(digits === undefined ? 1 : digits) + '%';
    }

    /* ------------------------- 卡片 UI ------------------------- */

    /** 历史最高段位的高亮框 */
    function buildHighlight(h) {
        const box = el('div', 'mt-3 rounded-lg border border-amber-300/70 dark:border-amber-400/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-400/10 dark:to-orange-500/5 p-3');

        const head = el('div', 'flex items-center justify-between gap-2 mb-1');
        const label = el('span', 'text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5');
        label.innerHTML = '<i class="fa fa-trophy"></i>';
        label.append(el('span', null, h.label || '历史最高段位'));
        head.append(label);
        if (h.season) head.append(el('span', 'text-xs text-amber-600 dark:text-amber-400', `赛季 ${h.season}`));
        box.append(head);

        const main = el('div', 'flex items-baseline gap-2 flex-wrap');
        const rankEl = el('span', 'text-2xl font-bold leading-none', h.rank || '—');
        if (h.color) rankEl.style.color = h.color;
        main.append(rankEl);
        if (h.scoreText) main.append(el('span', 'text-sm text-gray-600 dark:text-gray-300', h.scoreText));
        else if (h.score) main.append(el('span', 'text-sm text-gray-600 dark:text-gray-300', `${h.score} 分`));
        box.append(main);

        const rows = (h.rows || []).filter(r => r && r[1] !== null && r[1] !== undefined && r[1] !== '');
        if (rows.length) {
            const grid = el('div', 'mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5');
            rows.forEach(row => {
                const cell = el('div', 'flex items-baseline justify-between gap-1');
                cell.append(el('span', 'text-[11px] text-gray-500 dark:text-gray-400', row[0]));
                cell.append(el('span', 'text-xs font-medium text-gray-700 dark:text-gray-200', String(row[1])));
                grid.append(cell);
            });
            box.append(grid);
        }
        return box;
    }

    /** 5E 历史最高段位（来自 player/best_season） */
    function fiveEBestHighlight(b) {
        if (!b || !Number(b.elo)) return null;
        const total = Number(b.match_total) || 0;
        const win = Number(b.win_total) || 0;
        const winRate = total > 0 ? (win / total * 100).toFixed(1) + '%' : null;
        const elo = Number(b.elo);
        const stars = Number(b.star_num) || 0;
        return {
            highlight: {
                label: '5E 历史最高段位',
                rank: getRankText(elo, stars),
                scoreText: weIsSTier(elo) ? `${stars} 星` : `${Math.round(elo)} 分`,
                season: b.best_season,
                color: getRankColor(elo, stars),
                rows: [
                    ['场次', num(total)],
                    ['胜率', winRate],
                    ['Rating', num(b.rating, 2)],
                    ['ADR', num(b.adr, 1)],
                    ['RWS', num(b.rws, 2)],
                    ['全服排名', b.rank ? `#${b.rank}` : null]
                ]
            }
        };
    }

    /** 完美历史最高段位（扫描各赛季得到） */
    function perfectBestHighlight(bs) {
        if (!bs || !bs.score) return null;
        const d = bs.data || {};
        const stars = Number(d.stars) || 0;
        return {
            highlight: {
                label: '完美历史最高段位',
                rank: pwRankText(bs.score, stars),
                scoreText: pwIsSTier(bs.score) ? `${stars} 星` : `${bs.score} 分`,
                season: bs.seasonId,
                color: pwRankColor(bs.score, stars),
                rows: [
                    ['场次', num(d.cnt)],
                    ['胜率', pct(d.winRate)],
                    ['KD', num(d.kd, 2)],
                    ['Rating', num(d.rating, 2)],
                    ['ADR', num(d.adr, 1)],
                    ['RWS', num(d.rws, 2)],
                    ['爆头率', pct(d.headShotRatio)],
                    ['WE 评分', num(d.avgWe, 2)]
                ]
            }
        };
    }

    /** 复制到剪贴板：http（非 localhost）下 navigator.clipboard 不可用，回退到 execCommand */
    function copyText(text) {
        if (navigator.clipboard && (window.isSecureContext || location.protocol === 'file:')) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, text.length);
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) resolve(); else reject(new Error('copy failed'));
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 平台区块（带「查询中 / 已完成 / 无数据」状态） */
    function makeSection(title, color) {
        const root = el('section', 'rounded-lg border border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg p-4');
        const head = el('div', 'flex items-center justify-between gap-2 mb-2');
        const h = el('h3', 'font-medium text-sm flex items-center gap-2');
        const dot = el('span', 'inline-block w-2 h-2 rounded-full');
        dot.style.backgroundColor = color;
        h.append(dot, el('span', null, title));
        const badge = el('span', 'text-xs px-2 py-0.5 rounded-full', '等待中');
        head.append(h, badge);

        const loading = el('div', 'text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2 py-1');
        const loadingText = el('span', null, '查询中…');
        loading.append(el('i', 'fa fa-spinner fa-spin'), loadingText);

        const bodyEl = el('div', 'space-y-1 hidden');
        const noteEl = el('div', 'text-xs text-gray-500 dark:text-gray-400 py-1 hidden');

        root.append(head, loading, bodyEl, noteEl);

        const setBadge = (text, tone) => {
            badge.textContent = text;
            badge.className = 'text-xs px-2 py-0.5 rounded-full ' + (
                tone === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                tone === 'warn' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-gray-200 dark:bg-dark-border text-gray-500 dark:text-gray-400'
            );
        };
        setBadge('等待中', 'gray');

        return {
            root,
            start(text) {
                loading.classList.remove('hidden');
                bodyEl.classList.add('hidden');
                noteEl.classList.add('hidden');
                loadingText.textContent = text || '查询中…';
                setBadge('查询中', 'gray');
            },
            note(text) {
                loading.classList.add('hidden');
                bodyEl.classList.add('hidden');
                noteEl.classList.remove('hidden');
                noteEl.textContent = text || '暂无数据';
                setBadge('无数据', 'gray');
            },
            done(badgeText, tone, blocks) {
                bodyEl.innerHTML = '';
                (blocks || []).forEach(block => {
                    if (!block) return;
                    if (block.highlight) {
                        bodyEl.append(buildHighlight(block.highlight));
                        return;
                    }
                    if (block.title) {
                        bodyEl.append(el('p', 'text-xs font-medium text-gray-400 dark:text-gray-500 mt-2 mb-1', block.title));
                    }
                    (block.rows || []).forEach(row => {
                        if (!row) return;
                        const label = row[0], value = row[1], opt = row[2] || {};
                        if (value === null || value === undefined || value === '') return;
                        const r = el('div', 'flex items-baseline justify-between gap-3');
                        r.append(el('span', 'text-xs text-gray-500 dark:text-gray-400 shrink-0', label));
                        const v = el('span', 'text-sm font-medium text-right break-all', String(value));
                        if (opt.cls) v.className += ' ' + opt.cls;
                        if (opt.color) v.style.color = opt.color;
                        r.append(v);
                        bodyEl.append(r);
                    });
                    if (block.node) bodyEl.append(block.node);
                });
                loading.classList.add('hidden');
                noteEl.classList.add('hidden');
                bodyEl.classList.remove('hidden');
                setBadge(badgeText || '已完成', tone || 'ok');
            }
        };
    }

    /** 玩家卡片骨架：头像 + 昵称 + SteamID + 三个平台区块 */
    function createCard(preference) {
        const root = el('div', 'player-card bg-white dark:bg-dark-card rounded-xl shadow-md overflow-hidden');

        const head = el('div', 'p-5 flex gap-4 items-start');
        const avatar = el('img', 'w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-dark-border');
        avatar.alt = '头像';
        avatar.style.display = 'none';

        const info = el('div', 'flex-1 min-w-0');
        const titleRow = el('div', 'flex flex-wrap items-center gap-2 mb-1');
        const title = el('span', 'text-lg font-bold', '查询中…');
        const badge5e = el('span', 'hidden text-xs px-2 py-0.5 rounded-full font-medium text-white');
        const badgePw = el('span', 'hidden text-xs px-2 py-0.5 rounded-full font-medium text-white');
        titleRow.append(title, badge5e, badgePw);

        const sidRow = el('div', 'text-sm text-gray-500 dark:text-gray-400');
        sidRow.append(el('span', null, 'SteamID：'));
        const sidEl = el('span', 'font-mono text-gray-700 dark:text-gray-200', '解析中…');
        sidRow.append(sidEl);
        const copyBtn = el('button', 'ml-2 text-xs text-secondary hover:underline', '复制');
        sidRow.append(copyBtn);

        const namesEl = el('p', 'text-sm text-gray-500 dark:text-gray-400 mt-1 truncate', '');

        info.append(titleRow, sidRow, namesEl);
        head.append(avatar, info);
        root.append(head);

        const grid = el('div', 'px-5 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-4');
        const sections = {
            '5e': makeSection('5E 平台', '#FB7299'),
            perfect: makeSection('完美平台', '#3B82F6'),
            steam: makeSection('Steam 平台', '#10B981')
        };
        grid.append(sections['5e'].root, sections.perfect.root, sections.steam.root);
        root.append(grid);

        const card = {
            root, avatar, title, badge5e, badgePw, sidEl, namesEl, sections,
            preference: preference || '5e',
            nick: { '5e': null, perfect: null, steam: null },
            avatarSet: false,
            avatarP: 0,
            steamId: null
        };

        const renderNames = () => {
            card.namesEl.textContent =
                `5E：${card.nick['5e'] || '—'} ｜ 完美：${card.nick.perfect || '—'} ｜ Steam：${card.nick.steam || '—'}`;
            const order = card.preference === 'perfect'
                ? ['perfect', '5e', 'steam']
                : ['5e', 'perfect', 'steam'];
            const first = order.map(k => card.nick[k]).filter(Boolean)[0];
            card.title.textContent = first || '查询中…';
        };

        card.setNick = (kind, name) => {
            if (!name) return;
            card.nick[kind] = name;
            renderNames();
        };
        card.setSteamId = (sid) => {
            card.steamId = sid || null;
            card.sidEl.textContent = sid || '未解析到';
        };
        /** priority 越大越优先（完美头像 3 > 5E 头像 2 > Steam 头像 1） */
        card.setAvatar = (url, priority) => {
            if (!url) return;
            const p = priority || 0;
            if (card.avatarSet && p <= card.avatarP) return;
            card.avatarSet = true;
            card.avatarP = p;
            card.avatar.src = url;
            card.avatar.style.display = '';
            card.avatar.onerror = () => { card.avatar.style.display = 'none'; };
        };
        card.setBadge5E = (text, color) => {
            if (!text) return;
            card.badge5e.textContent = text;
            card.badge5e.style.backgroundColor = color || '#FB7299';
            card.badge5e.classList.remove('hidden');
        };
        card.setBadgePw = (text, color) => {
            if (!text) return;
            card.badgePw.textContent = text;
            card.badgePw.style.backgroundColor = color || '#3B82F6';
            card.badgePw.classList.remove('hidden');
        };

        copyBtn.addEventListener('click', () => {
            if (!card.steamId) return;
            copyText(card.steamId).then(
                () => {
                    copyBtn.textContent = '已复制';
                    setTimeout(() => { copyBtn.textContent = '复制'; }, 1500);
                },
                () => alert('复制失败，请手动选择复制')
            );
        });

        renderNames();
        return card;
    }

    /* ------------------------- 三个平台的数据加载 ------------------------- */

    /**
     * 5E 平台
     * target: { steamId } 或 { username, domain } 或 { uuid }
     * @returns {Promise<string|null>} 解析到的 5E uuid
     */
    async function load5E(seq, card, target) {
        const sec = card.sections['5e'];
        const alive = () => seq === state.seq;
        sec.start('查询 5E 数据…');
        try {
            let uuid = target.uuid || null;
            let domain = target.domain || null;
            let username = target.username || null;

            // 只给了 SteamID：先反查 5E 昵称，再按昵称搜索定位 domain
            if (!uuid && !domain) {
                const u = await get_5EUserBySteamId(target.steamId);
                if (!alive()) return null;
                if (!u) { sec.note('该 Steam 账号未绑定 5E'); return null; }
                username = u.username;
                card.setNick('5e', username);
                if (u.avatar) card.setAvatar(IMG_HOST + u.avatar, 2);

                const res = await get_player(username);
                if (!alive()) return null;
                const list = (res && res.data && res.data.user && res.data.user.list) || [];
                const hit = list.filter(x => x && x.username === username)[0] || list[0];
                if (!hit) { sec.note('5E 搜不到这个昵称（可能刚改过名）'); return null; }
                domain = hit.domain;
                if (hit.avatar_url) card.setAvatar(IMG_HOST + hit.avatar_url, 2);
            }

            if (!uuid) uuid = await get_uuid(domain);
            if (!alive()) return null;
            if (!uuid || uuid === '获取失败') { sec.note('5E 账号 ID 获取失败'); return null; }

            const [home, userData, bestSeason] = await Promise.all([
                get_home(uuid),
                get_userData(uuid),
                get_best_season(uuid)
            ]);
            if (!alive()) return uuid;

            const nick = (userData && userData.username) || username || '未知';
            card.setNick('5e', nick);

            const elo = home ? (Number(home.elo) || 0) : 0;
            const stars = home ? (Number(home.star_num) || 0) : 0;
            const eloIsS = weIsSTier(elo);
            const statusText = getAccountStatusText(userData && userData.account_status);
            const normal = (statusText === '账户正常' || statusText === '未知状态');
            if (elo > 0) {
                card.setBadge5E(`${getRankText(elo, stars)} · ${eloIsS ? `${stars} 星` : Math.round(elo)}`, getRankColor(elo, stars));
            }

            const hasSeason = !!(home && (Number(home.match_total) > 0 || Number(home.rating) > 0 ||
                Number(home.adr) > 0 || Number(home.rws) > 0));

            sec.done(normal ? '正常' : '异常', normal ? 'ok' : 'warn', [
                {
                    rows: [
                        ['5E 昵称', nick],
                        ['账号状态', statusText, { cls: normal ? 'text-green-500' : 'text-red-500' }],
                        [eloIsS ? '段位星级' : '5E 排位分', elo ? (eloIsS ? `${stars} 星` : Math.round(elo)) : '未定级'],
                        ['段位', elo ? getRankText(elo, stars) : '未定级']
                    ]
                },
                fiveEBestHighlight(bestSeason),
                hasSeason ? {
                    title: '本赛季（优先排位）',
                    rows: [
                        ['Rating', num(home.rating, 2)],
                        ['ADR', num(home.adr, 1)],
                        ['RWS', num(home.rws, 2)],
                        ['场次', num(home.match_total)]
                    ]
                } : null,
                {
                    title: '账号资料',
                    rows: [
                        ['注册时间', '未公开'],
                        ['信誉分', '未公开'],
                        ['违规记录', '未公开']
                    ]
                }
            ]);
            return uuid;
        } catch (e) {
            console.error('5E 数据加载失败:', e);
            if (alive()) sec.note('5E 数据加载失败');
            return null;
        }
    }

    /** 完美平台（需要 SteamID） */
    async function loadPerfect(seq, card, target) {
        const sec = card.sections['perfect'];
        const alive = () => seq === state.seq;
        sec.start('查询完美数据…');
        try {
            const sid = target.steamId;
            if (!sid) { sec.note('没有 SteamID，无法查询完美数据'); return; }

            const list = await pwSearchUser(sid, true);
            if (!alive()) return;
            const hit = (list || []).filter(x => x && String(x.steamId) === String(sid))[0] || (list || [])[0];
            if (!hit) { sec.note('该 Steam 账号没有绑定完美平台'); return; }

            const score = Number(hit.pvpScore) || 0;
            const nick = hit.pvpNickName || hit.appNickName || '未知';
            card.setNick('perfect', nick);
            card.setAvatar(hit.pvpAvatar, 3);

            // 完美 S 段位（2401+）不显示分数，改成显示星星；星星要等 detailStats 回来才拿到
            const headRows = [
                ['完美昵称', nick],
                ['App 昵称', hit.appNickName],
                ['完美排位分', score || '未定级'],
                ['完美段位', score ? pwRankText(score, 0) : '未定级']
            ];
            const headBlock = { rows: headRows };
            const applyScoreInfo = (st) => {
                if (score <= 0) return;
                const known = (st !== null && st !== undefined);
                const starsNum = Number(st) || 0;
                const sTier = pwIsSTier(score);
                if (sTier) {
                    headRows[2] = ['段位星级', known ? `${starsNum} 星` : '—'];
                    headRows[3] = ['完美段位', known ? pwRankText(score, starsNum) : 'S'];
                    card.setBadgePw(`${known ? pwRankText(score, starsNum) : 'S'} · ${known ? `${starsNum} 星` : '—'}`, pwRankColor(score, starsNum));
                } else {
                    headRows[2] = ['完美排位分', score];
                    headRows[3] = ['完美段位', pwRankText(score, 0)];
                    card.setBadgePw(`${pwRankText(score, 0)} · ${score}`, pwRankColor(score, 0));
                }
            };
            applyScoreInfo(null);

            // 基础信息先展示，详细数据继续加载
            sec.done(score ? '已绑定' : '未定级', 'ok', [headBlock]);
            sec.start('加载完美战绩…');

            // 历史最高段位需要扫赛季，比较慢，先放出去跑，回来再插进页面
            const bestSeasonPromise = getPerfectBestSeason(sid);

            const [csInfo, forbid, matches, pvp, accounts, online] = await Promise.all([
                getCsInfo(sid),
                getAccountForbidInfo(sid),
                getAccountMatches(sid),
                getPvPStats(sid),
                getUserAccounts(hit.userId),
                getOnlineStatus(sid)
            ]);
            if (!alive()) return;

            // S 段位需要星星数，detailStats 里才有
            applyScoreInfo(pvp ? pvp.stars : null);

            const black = detectBlackAccount(matches);
            const best = getMaxPvpScoreFromMatches(matches);
            const avg = getAvgKillFromMatches(matches);

            const blocks = [headBlock];

            const accRows = [
                ['优先状态', csInfo || '未知'],
                ['封禁状态', forbid || '未知', {
                    cls: (forbid && forbid.indexOf('状态正常') > -1) ? 'text-green-500' : 'text-red-500'
                }],
                ['黑产检测', black.details, { cls: black.isBlack ? 'text-red-500' : 'text-green-500' }],
                ['当前状态', (online && online.online) ? `完美游戏中（${online.duration} 局）` : '离线']
            ];
            if (accounts && accounts.length > 1) accRows.push(['绑定账号', `${accounts.length} 个`]);
            blocks.push({ title: '账号状态', rows: accRows });

            if (pvp && Number(pvp.cnt) > 0) {
                blocks.push({
                    title: '完美天梯（本赛季）',
                    rows: [
                        ['场次', num(pvp.cnt)],
                        ['KD', num(pvp.kd, 2)],
                        ['Rating', num(pvp.rating, 2)],
                        ['ADR', num(pvp.adr, 1)],
                        ['RWS', num(pvp.rws, 2)],
                        ['爆头率', pct(pvp.headShotRatio)],
                        ['胜率', pct(pvp.winRate)],
                        ['WE 评分', num(pvp.avgWe, 2)]
                    ]
                });
            }

            if (matches && matches.length > 0) {
                blocks.push({
                    title: '近期表现',
                    rows: [
                        ['近期最高分', best],
                        ['场均击杀', avg && avg.avgKill],
                        ['场均死亡', avg && avg.avgDeath],
                        ['近期 KD', avg && avg.kd]
                    ]
                });
            }

            if (accounts && accounts.length > 1) {
                const wrap = el('div', 'space-y-1 pt-1');
                accounts.filter(a => String(a.steamId) !== String(sid)).slice(0, 8).forEach(a => {
                    const row = el('div', 'flex items-baseline justify-between gap-2');
                    row.append(el('span', 'text-xs text-gray-500 dark:text-gray-400 truncate', a.nickName || a.pvpNickName || '未知'));
                    row.append(el('span', 'text-xs font-mono text-gray-400 dark:text-gray-500', String(a.steamId)));
                    wrap.append(row);
                });
                blocks.push({ title: '其它绑定账号', node: wrap });
            }

            const good = (forbid && forbid.indexOf('状态正常') > -1);
            const badgeText = good ? '已绑定' : '有异常';
            const tone = good ? 'ok' : 'warn';

            // 历史最高段位晚一点到，到了再重绘一次（此时完美国服/天梯数据已经展示出来了）
            let ready = false;
            let bestBox = null;
            let bestInserted = false;
            const insertBest = () => {
                if (!bestBox || bestInserted) return;
                blocks.splice(Math.min(1, blocks.length), 0, bestBox);
                bestInserted = true;
            };
            const render = () => {
                if (!ready || !alive()) return;
                sec.done(badgeText, tone, blocks);
            };

            bestSeasonPromise.then(bs => {
                if (!alive()) return;
                bestBox = perfectBestHighlight(bs);
                if (!bestBox) return;
                insertBest();
                render();
            });

            ready = true;
            insertBest();
            render();
        } catch (e) {
            console.error('完美数据加载失败:', e);
            if (alive()) sec.note('完美数据加载失败');
        }
    }

    /** 国服数据区块（完美官方接口返回的 CS 国服战绩） */
    function officialStatsBlock(official) {
        if (!official) return null;
        const rows = [
            ['游戏时长', official.hours ? `${official.hours} 小时` : null],
            ['场次', num(official.cnt)],
            ['胜率', pct(official.winRate)],
            ['KD', num(official.kd, 2)],
            ['Rating', num(official.rating, 2)],
            ['ADR', num(official.adr, 1)],
            ['RWS', num(official.rws, 2)],
            ['爆头率', pct(official.headShotRatio)],
            ['KAST', (official.kast !== null && official.kast !== undefined) ? `${official.kast}%` : null]
        ].filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '');
        if (rows.length === 0) return null;
        return { title: '国服数据', rows: rows };
    }

    /**
     * Steam 平台（steamrepcn 资料 + 国服数据）
     * 国服数据走完美官方接口，两个请求并行；Steam 资料先到先渲染，国服数据到了再补上。
     */
    async function loadSteam(seq, card, sid) {
        const sec = card.sections['steam'];
        const alive = () => seq === state.seq;
        if (!sid) { sec.note('没有 SteamID，无法查询 Steam 资料'); return; }
        sec.start('查询 Steam 资料…');

        let badge = '正常';
        let tone = 'ok';
        let ready = false;
        const blocks = [];
        const refresh = () => {
            if (!ready || !alive()) return;
            sec.done(badge, tone, blocks);
        };

        // 国服数据先放出去跑
        const officialPromise = getOfficialStats(sid).then(official => {
            if (!alive()) return;
            const block = officialStatsBlock(official);
            if (!block) return;
            blocks.push(block);
            refresh();
        });

        try {
            const d = await get_steamData(sid);
            if (!alive()) return;

            if (d) {
                card.setNick('steam', d.SteamName);
                card.setAvatar(d.steam_avatar, 1);

                const vac = d['VAC 作弊系统检测'] || '未知';
                const vacOk = (vac === '正常' || vac === '未知');
                badge = vacOk ? '正常' : 'VAC 异常';
                tone = vacOk ? 'ok' : 'warn';
                blocks.unshift({
                    rows: [
                        ['Steam 昵称', d.SteamName],
                        ['SteamID', sid],
                        ['注册时间', d['Steam 注册时间']],
                        ['社区等级', d['Steam 社区等级']],
                        ['游戏数量', d['Steam 游戏数']],
                        ['VAC 状态', vac, { cls: vacOk ? 'text-green-500' : 'text-red-500' }],
                        ['交易状态', d['Steam 交易状态']]
                    ]
                });
            } else {
                badge = '部分数据';
                tone = 'warn';
                blocks.unshift({
                    rows: [
                        ['SteamID', sid],
                        ['Steam 资料', '获取失败']
                    ]
                });
            }

            ready = true;
            refresh();
            // 等一等国服数据，回来后再刷新一次
            await officialPromise;
        } catch (e) {
            console.error('Steam 数据加载失败:', e);
            if (alive()) sec.note('Steam 资料加载失败');
        }
    }

    /* ------------------------- 查询流程 ------------------------- */

    function setHint(text) {
        $('searchHint').textContent = text || '';
    }

    function resetResults(keepCandidates) {
        $('resultsContainer').innerHTML = '';
        $('initialState').classList.add('hidden');
        state.card = null;
        if (!keepCandidates) {
            const bar = $('candidatesBar');
            bar.innerHTML = '';
            bar.classList.add('hidden');
            bar.classList.remove('flex');
        }
    }

    function addCard(preference) {
        const card = createCard(preference);
        $('resultsContainer').appendChild(card.root);
        state.card = card;
        return card;
    }

    /** 三个平台都没查到昵称时，标题不要一直停在「查询中…」 */
    function finalizeTitle(card, fallback) {
        if (card.nick['5e'] || card.nick.perfect || card.nick.steam) return;
        card.title.textContent = fallback || '未找到玩家';
    }

    /** 同名候选切换条 */
    function renderCandidates(list, onPick) {
        const bar = $('candidatesBar');
        bar.innerHTML = '';
        if (!list || list.length <= 1) {
            bar.classList.add('hidden');
            bar.classList.remove('flex');
            return;
        }
        bar.classList.remove('hidden');
        bar.classList.add('flex');
        bar.append(el('span', 'text-xs text-gray-500 dark:text-gray-400 self-center mr-1', `共 ${list.length} 个匹配：`));

        const resetChip = (btn) => {
            btn.className = 'px-3 py-1 rounded-full text-xs border transition-colors border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:border-primary';
        };
        const chipNodes = [];
        list.slice(0, 12).forEach((item, idx) => {
            const btn = el('button', null, item.label);
            resetChip(btn);
            if (idx === 0) btn.className = 'px-3 py-1 rounded-full text-xs border transition-colors bg-primary text-white border-primary';
            btn.addEventListener('click', () => {
                chipNodes.forEach(resetChip);
                btn.className = 'px-3 py-1 rounded-full text-xs border transition-colors bg-primary text-white border-primary';
                onPick(item);
            });
            chipNodes.push(btn);
            bar.append(btn);
        });
    }

    /** 直接按 SteamID 查三平台 */
    async function runBySteamId(seq, sid, preference) {
        const card = addCard(preference);
        card.setSteamId(sid);
        state.steamId = sid;
        setHint('已识别 SteamID，正在并行查询 5E / 完美 / Steam…');
        await Promise.allSettled([
            load5E(seq, card, { steamId: sid }),
            loadPerfect(seq, card, { steamId: sid }),
            loadSteam(seq, card, sid)
        ]);
        if (seq !== state.seq) return;
        finalizeTitle(card, sid);
        setHint('');
    }

    /** 用 5E 昵称查：先出 5E 数据，再从对局记录里解析 SteamID 去查另外两个平台 */
    async function runBy5ENickname(seq, keyword, forced) {
        let candidates = forced ? [forced] : null;

        if (!candidates) {
            setHint('正在 5E 搜索昵称…');
            const res = await get_player(keyword);
            if (seq !== state.seq) return;
            const list = (res && res.data && res.data.user && res.data.user.list) || [];
            if (list.length === 0) { setHint(`5E 没找到「${keyword}」`); return; }
            candidates = list.map(u => ({
                label: u.username,
                username: u.username,
                domain: u.domain,
                avatar_url: u.avatar_url
            }));
            renderCandidates(candidates, (c) => doSearch(keyword, { candidate: c }));
        }

        const cand = candidates[0];
        setHint('');
        const card = addCard('5e');
        card.setNick('5e', cand.label);
        if (cand.avatar_url) card.setAvatar(IMG_HOST + cand.avatar_url, 2);

        // 1) 先渲染 5E
        const uuid = await load5E(seq, card, { username: cand.username, domain: cand.domain });
        if (seq !== state.seq) return;

        // 2) 再从对局记录里拿 SteamID
        card.sections.perfect.start('从 5E 对局记录解析 SteamID…');
        card.sections.steam.start('从 5E 对局记录解析 SteamID…');

        let sid = null;
        try {
            if (uuid) {
                const matchId = await get_macthlist(uuid);
                if (seq !== state.seq) return;
                if (matchId) sid = await get_steamID(matchId, uuid);
            }
        } catch (e) {
            console.error('解析 SteamID 失败:', e);
        }
        if (seq !== state.seq) return;

        if (!sid) {
            card.sections.perfect.note('没能从 5E 对局记录里解析出 SteamID');
            card.sections.steam.note('没能从 5E 对局记录里解析出 SteamID');
            return;
        }

        card.setSteamId(sid);
        state.steamId = sid;
        // 3) 并行查完美 + Steam（各自查到就各自渲染）
        await Promise.allSettled([
            loadPerfect(seq, card, { steamId: sid }),
            loadSteam(seq, card, sid)
        ]);
        if (seq === state.seq) finalizeTitle(card, keyword);
    }

    /** 用完美昵称查：完美搜索结果里自带 SteamID，可以立刻并行查 5E + Steam */
    async function runByPerfectNickname(seq, keyword, forced) {
        let candidates = forced ? [forced] : null;

        if (!candidates) {
            setHint('正在 完美 搜索昵称…');
            const list = await pwSearchUser(keyword, false);
            if (seq !== state.seq) return;
            if (!list || list.length === 0) { setHint(`完美 没找到「${keyword}」`); return; }
            candidates = list.map(u => ({
                label: `${u.pvpNickName || u.appNickName || '未知'}（${u.steamId}）`,
                steamId: u.steamId
            }));
            renderCandidates(candidates, (c) => doSearch(keyword, { candidate: c }));
        }

        const cand = candidates[0];
        setHint('');
        const card = addCard('perfect');
        card.setSteamId(cand.steamId);
        state.steamId = cand.steamId;

        await Promise.allSettled([
            loadPerfect(seq, card, { steamId: cand.steamId }),
            load5E(seq, card, { steamId: cand.steamId }),
            loadSteam(seq, card, cand.steamId)
        ]);
        if (seq === state.seq) finalizeTitle(card, keyword);
    }

    async function doSearch(rawKeyword, opts) {
        const keyword = String(rawKeyword === null || rawKeyword === undefined ? '' : rawKeyword).trim();
        if (!keyword) { setHint('请输入昵称或 SteamID'); return; }
        opts = opts || {};

        // 17 位但不是 76 开头，给出提示但仍按昵称查
        if (/^\d{17}$/.test(keyword) && !STEAM_ID_RE.test(keyword)) {
            setHint('SteamID 应该是 76 开头共 17 位数字，将按昵称查询…');
        }

        const seq = ++state.seq;
        resetResults(!!opts.candidate);
        state.steamId = null;

        try {
            if (STEAM_ID_RE.test(keyword)) {
                await runBySteamId(seq, keyword, state.mode);
            } else if (state.mode === '5e') {
                await runBy5ENickname(seq, keyword, opts.candidate);
            } else {
                await runByPerfectNickname(seq, keyword, opts.candidate);
            }
        } catch (e) {
            console.error('查询出错:', e);
            if (seq === state.seq) setHint(`查询出错：${e && e.message ? e.message : e}`);
        }
    }

    /* ------------------------- 模式切换 & 初始化 ------------------------- */

    function setMode(mode) {
        state.mode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            const active = btn.dataset.mode === mode;
            btn.className = 'mode-btn px-4 py-2 rounded-md text-sm font-medium transition-colors ' + (
                active
                    ? 'bg-primary text-white shadow'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
            );
        });
        $('searchInput').placeholder = mode === '5e'
            ? '输入 5E 昵称（或 SteamID）'
            : '输入 完美昵称（或 SteamID）';
    }

    document.addEventListener('DOMContentLoaded', () => {
        // 主题
        if (localStorage.getItem('theme') === 'dark' ||
            (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        $('themeToggle').addEventListener('click', () => {
            if (document.documentElement.classList.contains('dark')) {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
            }
        });

        // 模式切换
        setMode('5e');
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => setMode(btn.dataset.mode));
        });

        // 搜索
        const input = $('searchInput');
        $('searchButton').addEventListener('click', () => doSearch(input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch(input.value);
        });
    });
})();
