/**
 * SCOUTER — 챗씨부인운명상담소
 * SillyTavern Extension v2.0.0
 */

import { event_types } from '../../../events.js';

const MODULE_NAME = 'character_lab';

// ═══════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════
const STAT_META = {
    combat:   { label: '⚔️ 전투력',   color: '#ff2200' },
    roast:    { label: '🗣️ 언변',     color: '#ff8800' },
    sex:      { label: '🔥 성적매력', color: '#ff1177' },
    mental:   { label: '🧠 정신력',   color: '#9900ff' },
    charisma: { label: '👑 카리스마', color: '#ffaa00' },
};
const GENDER_SECTIONS = [
    { id: 'female', label: '♀ 여성', color: '#ff44aa' },
    { id: 'male',   label: '♂ 남성', color: '#4488ff' },
];
const RANK_THRESHOLDS = [
    { min: 430, label: '신급 ★★★★★', color: '#fff700' },
    { min: 380, label: '초인급 ★★★★', color: '#ff8800' },
    { min: 320, label: '엘리트 ★★★',  color: '#ff2200' },
    { min: 260, label: '강자 ★★',     color: '#4488ff' },
    { min: 0,   label: '범인 ★',      color: '#664466' },
];

// ═══════════════════════════════════════════
// 프롬프트 메타 & 기본 슬롯
// ═══════════════════════════════════════════
import { PROMPT_META, DEFAULT_PROMPTS } from './prompts.js';



// ═══════════════════════════════════════════
// 기본 설정
// ═══════════════════════════════════════════
const defaultSettings = {
    roster: [], madameList: [], sajuList: [], fortuneRooms: [],
    allowSameGender: false, selectedProfileName: null, fortuneProfileName: null,
    devUnlocked: false, prompts: null, maxTokens: 4000,
};

// ═══════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════
let state = {
    currentTab: 'roster',
    currentMadameSubtab: 'compat',
    rosterView: 'list',
    madameCompatView: 'list',
    detailCharId: null,
    activeMadameId: null,
    madameSetup: { selected: [] },
    sajuView: 'list',
    sajuCharId: null,
    activeSajuId: null,
    isPanelOpen: false,
};

// ═══════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════
function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) ctx.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    const s = ctx.extensionSettings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (s[key] === undefined) s[key] = structuredClone(defaultSettings[key]);
    }
    return s;
}
function save() { SillyTavern.getContext().saveSettingsDebounced(); }
function getRank(t) { return RANK_THRESHOLDS.find(r => t >= r.min) || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1]; }

function getCharLabel(stats) {
    const { combat, roast, sex, mental, charisma } = stats;
    const total = combat + roast + sex + mental + charisma;
    const avg = total / 5;

    // 고르게 높거나 낮은 경우
    const vals = [combat, roast, sex, mental, charisma];
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const spread = max - min;

    if (spread < 15) {
        if (avg >= 80) return '완성형 인간';
        if (avg >= 60) return '위험한 전인';
        if (avg >= 40) return '평범한 일상인';
        return '숨어있는 가능성';
    }

    // 1위 스탯 찾기
    const entries = { combat, roast, sex, mental, charisma };
    const top = Object.entries(entries).sort((a, b) => b[1] - a[1])[0][0];
    const topVal = entries[top];
    const high = topVal >= 80;

    switch (top) {
        case 'combat':
            if (high) return topVal >= 90 ? '살아있는 무기' : '전장의 포식자';
            return topVal >= 60 ? '거친 싸움꾼' : '몸으로 말하는 타입';
        case 'roast':
            if (high) return topVal >= 90 ? '말로 죽이는 타입' : '냉혹한 조율사';
            return topVal >= 60 ? '날 선 혀끝' : '말빨 하나는 확실한';
        case 'sex':
            if (high) return topVal >= 90 ? '존재 자체가 위험' : '치명적 유혹자';
            return topVal >= 60 ? '무심한 자석' : '모르는 척하는 매력';
        case 'mental':
            if (high) return topVal >= 90 ? '감정 없는 기계' : '흔들리지 않는 벽';
            return topVal >= 60 ? '냉정한 관찰자' : '속 알 수 없는 타입';
        case 'charisma':
            if (high) return topVal >= 90 ? '공간을 삼키는 존재' : '그림자 실세';
            return topVal >= 60 ? '자연스러운 리더' : '은근히 중심 잡는 타입';
        default:
            return '정체불명';
    }
}
function getTotal(c) { return Object.values(c.stats || {}).reduce((a, b) => a + b, 0); }
function avatarHue(n) { return [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; }
function genderColor(g) { return g === 'female' ? '#c87070' : '#7090b8'; }
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function filterPhoneTrigger(text) {
    return (text || '')
        .replace(/<phone_trigger[^>]*>[\s\S]*?<\/phone_trigger>/gi, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_{2}(.+?)_{2}/g, '$1')
        .replace(/---\s*$/, '')
        .trim();
}

// ═══════════════════════════════════════════
// 프롬프트 슬롯
// ═══════════════════════════════════════════
function getPromptSlot(key) {
    const s = getSettings();
    if (!s.prompts) s.prompts = {};
    const def = DEFAULT_PROMPTS[key];
    const p = s.prompts[key] || def;
    return p.slots?.[p.active ?? 0] || def.slots[0];
}
function fillTpl(tpl, vars) {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ═══════════════════════════════════════════
// AI 호출
// ═══════════════════════════════════════════
async function callAI(prompt, systemPrompt) {
    const ctx = SillyTavern.getContext();
    const settings = getSettings();
    const selectedProfileName = settings.selectedProfileName || null;

    if (selectedProfileName && ctx.ConnectionManagerRequestService) {
        const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
        const profile = profiles.find(p => p.name === selectedProfileName);
        if (profile) {
            const messages = systemPrompt
                ? [{ role: 'user', content: `${systemPrompt}\n\n${prompt}` }]
                : [{ role: 'user', content: prompt }];
            const response = await ctx.ConnectionManagerRequestService.sendRequest(
                profile.id, messages, settings.maxTokens || 4000,
                { stream: false, extractData: true, includePreset: true, includeInstruct: false }
            );
            let raw = '';
            if (typeof response === 'string') raw = response;
            else if (typeof response?.content === 'string') raw = response.content;
            else if (response?.choices?.[0]?.message?.content) raw = response.choices[0].message.content;
            else if (response?.content?.[0]?.text) raw = response.content[0].text;
            return filterPhoneTrigger(raw);
        }
    }

    // 프로필 없으면 현재 연결 그대로
    const { generateRaw } = ctx;
    const result = await generateRaw({
        systemPrompt: systemPrompt || undefined,
        prompt,
    });
    return filterPhoneTrigger(result || '');
}

// generateRaw 방식 — 메인 모델+프리셋, ST 컨텍스트 없이 순수 프롬프트만
async function callAIRaw(prompt, systemPrompt) {
    const { generateRaw } = SillyTavern.getContext();
    const result = await generateRaw({
        systemPrompt: systemPrompt || undefined,
        prompt,
    });
    return filterPhoneTrigger(result || '');
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
async function analyzeCharSheet(name, gender, rawSheet) {
    // 1차 호출 — 기본 정보 + stats
    const slot = getPromptSlot('analyze');
    const userPrompt = fillTpl(slot.user, { name, gender, sheet: rawSheet });
    let parsed;
    try {
        const raw = await callAI(userPrompt, slot.system);
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (!parsed.gender) parsed.gender = gender;
    } catch {
        parsed = { age: '불명', job: '불명', location: '불명', appearance: '분석 실패', personality: '분석 실패', traits: '분석 실패', gender, stats: { combat: 50, roast: 50, sex: 50, mental: 50, charisma: 50 } };
    }

    // 2차 호출 — intimacy 따로
    try {
        const iSlot = getPromptSlot('analyzeIntimacy');
        const iPrompt = fillTpl(iSlot.user, { name, sheet: rawSheet });
        const iRaw = await callAI(iPrompt, iSlot.system);
        parsed.intimacy = JSON.parse(iRaw.replace(/```json|```/g, '').trim());
    } catch {
        parsed.intimacy = { physique: '', desire: '', style: '', preference: '' };
    }

    return parsed;
}


// 원격 prompts.json 로드 — 로컬 오버라이드 없는 슬롯에만 적용
async function loadRemotePrompts() {
    try {
        const res = await fetch(PROMPTS_URL + '?t=' + Date.now()); // 캐시 방지
        if (!res.ok) return;
        const remote = await res.json();
        const settings = getSettings();
        if (!settings.prompts) settings.prompts = {};

        for (const key of Object.keys(remote)) {
            if (!settings.prompts[key]) {
                // 로컬에 없으면 원격 기본값으로 세팅
                settings.prompts[key] = {
                    active: 0,
                    slots: [{ name: '기본', system: remote[key].system, user: remote[key].user }]
                };
            } else {
                // 로컬에 있어도 슬롯 0번 이름이 '기본'이면 원격으로 업데이트
                const slot0 = settings.prompts[key].slots?.[0];
                if (slot0 && slot0.name === '기본') {
                    slot0.system = remote[key].system;
                    slot0.user = remote[key].user;
                }
            }
        }
        save();
        console.log(`[${MODULE_NAME}] 원격 프롬프트 로드 완료`);
    } catch (e) {
        console.warn(`[${MODULE_NAME}] 원격 프롬프트 로드 실패 (로컬 기본값 사용):`, e.message);
    }
}
const LOADING_MSGS = {
    analyze:  ['캐릭터 시트 해석 중...', '능력치 산출 중...', 'MINE신이 성향을 읽는 중...'],
    battle:   ['전투력 측정 중...', '승부의 기운이 감돕니다...', 'MINE신이 승자를 점치는 중...'],
    compat:   ['챗씨부인이 MINE신을 받습니다...', 'MINE신이 닻을 내립니다...', '챗씨부인이 인연의 실을 잡아챕니다...'],
    saju:     ['챗씨부인이 만세력을 펼칩니다...', 'MINE신이 천간지지를 읽고 있습니다...', '운명의 사주팔자가 드러나는구나...'],
    scenario: ['시나리오를 구성 중...', '장르를 선정 중...', '첫 장면을 그리는 중...'],
    sim:      ['두 사람의 기운을 읽는 중...', '상황을 펼쳐보는 중입니다...', '케미의 실이 엉키고 있습니다...'],
};

function showLoading(targetEl, type = 'analyze') {
    const msgs = LOADING_MSGS[type] || LOADING_MSGS.analyze;
    let msgIdx = 0;
    const overlay = document.createElement('div');
    overlay.id = 'scouter-loading';
    overlay.style.cssText = `position:sticky;bottom:0;left:0;right:0;background:${C.bgDeep}ee;border-top:1px solid ${C.border};z-index:10;display:flex;flex-direction:row;align-items:center;gap:12px;padding:10px 14px;backdrop-filter:blur(4px)`;
    overlay.innerHTML = `
        <div style="position:relative;width:32px;height:32px;flex-shrink:0">
            <svg viewBox="0 0 60 60" style="width:32px;height:32px;animation:scouter-spin 1.2s linear infinite">
                <circle cx="30" cy="30" r="24" fill="none" stroke="${C.border}" stroke-width="3"/>
                <circle cx="30" cy="30" r="24" fill="none" stroke="${C.accent}" stroke-width="3"
                    stroke-dasharray="40 110" stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px">🔴</div>
        </div>
        <div style="flex:1">
            <div id="scouter-loading-msg" style="font-size:11px;color:${C.text};font-family:monospace;letter-spacing:1px;line-height:1.5">${msgs[0]}</div>
            <div style="display:flex;gap:3px;margin-top:4px">
                <div class="scouter-dot" style="width:5px;height:5px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out infinite"></div>
                <div class="scouter-dot" style="width:5px;height:5px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out 0.2s infinite"></div>
                <div class="scouter-dot" style="width:5px;height:5px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out 0.4s infinite"></div>
            </div>
        </div>`;

    document.getElementById('scouter-loading')?.remove();

    const content = document.getElementById('cl-content');
    if (content) {
        content.style.position = 'relative';
        content.appendChild(overlay);
    }

    const interval = setInterval(() => {
        msgIdx = (msgIdx + 1) % msgs.length;
        const msgEl = document.getElementById('scouter-loading-msg');
        if (msgEl) {
            msgEl.style.opacity = '0';
            msgEl.style.transition = 'opacity 0.3s';
            setTimeout(() => {
                if (msgEl) { msgEl.textContent = msgs[msgIdx]; msgEl.style.opacity = '1'; }
            }, 300);
        }
    }, 1800);

    overlay._interval = interval;
    return overlay;
}

function hideLoading() {
    const overlay = document.getElementById('scouter-loading');
    if (overlay) {
        clearInterval(overlay._interval);
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(() => overlay.remove(), 300);
    }
}

// CSS 키프레임 추가
function injectLoadingCSS() {
    if (document.getElementById('scouter-loading-css')) return;
    const s = document.createElement('style');
    s.id = 'scouter-loading-css';
    s.textContent = `
@keyframes scouter-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes scouter-dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1.1);opacity:1} }
    `;
    document.head.appendChild(s);
}

// ═══════════════════════════════════════════
const C = {
    bg: '#08000f', bgCard: '#0f0015', bgDeep: '#050008',
    border: '#330055', borderLight: '#660088',
    text: '#cc99cc', textDim: '#664466', textBright: '#ffccff',
    accent: '#cc44ff', accentDim: '#8800cc',
    female: '#ff44aa', male: '#4488ff',
    purple: '#cc44ff', gold: '#ffaa00',
};

function renderAvatar(name, gender, size = 44) {
    const hue = avatarHue(name);
    const gc = genderColor(gender);
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 35% 35%,hsl(${hue},30%,28%),hsl(${hue},20%,12%));border:2px solid ${gc};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.33)}px;font-weight:900;color:hsl(${hue},50%,70%);flex-shrink:0;font-family:monospace;box-shadow:0 0 8px ${gc}44">${initials}</div>`;
}

function renderMiniStats(stats) {
    return `<div style="width:68px">${Object.entries(stats).map(([s, v]) =>
        `<div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">
        <span style="font-size:8px;width:12px;color:${STAT_META[s].color}">${STAT_META[s].label.split(' ')[0]}</span>
        <div style="flex:1;height:3px;background:#2a1e12;border-radius:1px;overflow:hidden">
        <div style="width:${v}%;height:100%;background:${STAT_META[s].color}"></div></div></div>`
    ).join('')}</div>`;
}

function renderTotalPow(total) {
    const rank = getRank(total);
    return `<div style="text-align:right;min-width:44px">
        <div style="font-size:18px;font-weight:900;color:${rank.color};font-family:monospace">${total}</div>
        <div style="font-size:9px;color:${rank.color}">${rank.label}</div>
    </div>`;
}

function renderDivider(label, color) {
    color = color || C.accent;
    return `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 10px">
        <div style="flex:1;height:1px;background:linear-gradient(90deg,${color}88,transparent)"></div>
        <span style="font-size:9px;font-weight:700;letter-spacing:2px;color:${color};font-family:monospace">◆ ${esc(label)} ◆</span>
        <div style="flex:1;height:1px;background:linear-gradient(270deg,${color}88,transparent)"></div>
    </div>`;
}

function renderAccordion(icon, title, summary, bodyHTML) {
    return `<div class="cl-accordion">
        <div class="cl-accordion-header">
            <span class="cl-accordion-icon">${icon}</span>
            <div style="flex:1">
                <div class="cl-accordion-title">${esc(title)}</div>
                <div class="cl-accordion-summary">${esc(summary)}</div>
            </div>
            <span class="cl-accordion-arrow">▾</span>
        </div>
        <div class="cl-accordion-body">${bodyHTML}</div>
    </div>`;
}

// ═══════════════════════════════════════════
// 플로팅 창 HTML
// ═══════════════════════════════════════════
function createFloatingPanel() {
    return `<div id="scouter-float" style="
        position:fixed; top:60px; right:20px;
        width:min(420px,95vw); height:80vh;
        background:${C.bg};
        border:2px solid #aa0066;
        border-radius:4px;
        box-shadow:-4px 0 30px #ff000033, 0 4px 30px #aa006644;
        z-index:9999;
        display:flex; flex-direction:column;
        resize:both; overflow:hidden;
        min-width:300px; min-height:360px;
        font-family: 'Noto Serif KR', 'Apple SD Gothic Neo', system-ui, sans-serif;
    ">
        <div id="scouter-drag-handle" style="
            background:linear-gradient(180deg, #1a0020, #0d0010);
            border-bottom:2px solid #aa0066;
            padding:8px 12px;
            display:flex; align-items:center; gap:10px;
            cursor:move; flex-shrink:0; user-select:none;
            box-shadow: 0 4px 20px #ff000022;
        ">
            <span style="font-size:16px;filter:drop-shadow(0 0 6px #ff2200)">🔴</span>
            <div style="flex:1">
                <div style="font-weight:900;font-size:13px;letter-spacing:2px;font-family:monospace" class="cl-shimmer">SCOUTER</div>
                <div style="font-size:9px;color:#440033;letter-spacing:1px;font-family:monospace">챗씨부인운명상담소</div>
            </div>
            <button id="scouter-close" style="background:none;border:1px solid #440033;border-radius:3px;color:#664433;cursor:pointer;font-size:12px;padding:2px 7px;font-family:monospace">✕</button>
        </div>
        <div id="cl-tabs" style="display:flex;background:linear-gradient(180deg,#0d0d20,#050510);border-bottom:1px solid #1e1e3a;flex-shrink:0">
            <button class="cl-tab" data-tab="roster">👤 캐릭터</button>
            <button class="cl-tab" data-tab="madame">🔮 챗씨부인</button>
            <button class="cl-tab" data-tab="fortune">🔯 운명점</button>
            <button class="cl-tab" data-tab="settings">⚙️ 설정</button>
        </div>
        <div id="cl-madame-subtabs" style="display:none;flex-shrink:0;background:#0a0015;border-bottom:1px solid #330055">
            <button class="cl-madame-subtab" data-subtab="compat">💘 궁합</button>
            <button class="cl-madame-subtab" data-subtab="saju">🪬 사주</button>
        </div>
        <div id="cl-content" style="flex:1;overflow-y:auto;overflow-x:hidden">
            <div class="cl-pane" id="cl-pane-roster"></div>
            <div class="cl-pane" id="cl-pane-madame-compat"></div>
            <div class="cl-pane" id="cl-pane-madame-saju"></div>
            <div class="cl-pane" id="cl-pane-fortune"></div>
            <div class="cl-pane" id="cl-pane-settings"></div>
        </div>
    </div>`;
}

// ═══════════════════════════════════════════
// 드래그
// ═══════════════════════════════════════════
function makeDraggable(panel, handle) {
    let drag = false, sx, sy, sl, st;
    handle.addEventListener('mousedown', e => {
        if (e.target.id === 'scouter-close') return;
        drag = true; sx = e.clientX; sy = e.clientY;
        const r = panel.getBoundingClientRect();
        sl = r.left; st = r.top; panel.style.right = 'auto';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
        if (!drag) return;
        panel.style.left = Math.max(0, sl + e.clientX - sx) + 'px';
        panel.style.top = Math.max(0, st + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
}

// ═══════════════════════════════════════════
// 패널 토글 (전역)
// ═══════════════════════════════════════════
function openFloat() {
    if (document.getElementById('scouter-float')) return;
    document.body.insertAdjacentHTML('beforeend', createFloatingPanel());
    const panel = document.getElementById('scouter-float');
    makeDraggable(panel, document.getElementById('scouter-drag-handle'));
    panel.querySelectorAll('.cl-tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    panel.querySelectorAll('.cl-madame-subtab').forEach(btn => btn.addEventListener('click', () => switchMadameSubtab(btn.dataset.subtab)));
    document.getElementById('scouter-close')?.addEventListener('click', closeFloat);
    state.isPanelOpen = true;
    switchTab('roster');
}
function closeFloat() {
    document.getElementById('scouter-float')?.remove();
    state.isPanelOpen = false;
}
function toggleFloat() {
    document.getElementById('scouter-float') ? closeFloat() : openFloat();
}

// ═══════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════
function switchTab(tab) {
    state.currentTab = tab;
    const tabColors = { roster: '#ff44aa', madame: '#cc44ff', fortune: '#ffcc00', settings: '#ffaa00' };
    document.querySelectorAll('#scouter-float .cl-tab').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        const color = tabColors[btn.dataset.tab] || C.accent;
        btn.style.color = isActive ? color : C.textDim;
        btn.style.borderBottom = isActive ? `2px solid ${color}` : '2px solid transparent';
        btn.style.fontWeight = isActive ? '900' : '400';
        btn.style.textShadow = isActive ? `0 0 8px ${color}88` : 'none';
    });
    const subtabs = document.getElementById('cl-madame-subtabs');
    if (subtabs) subtabs.style.display = tab === 'madame' ? 'flex' : 'none';
    // 운명점 탭은 모바일에서 드래그/리사이즈 가능
    const panel = document.getElementById('scouter-float');
    if (panel) panel.classList.toggle('fortune-mode', tab === 'fortune');
    renderActivePane();
}
function switchMadameSubtab(subtab) {
    state.currentMadameSubtab = subtab;
    document.querySelectorAll('#scouter-float .cl-madame-subtab').forEach(btn => {
        const isActive = btn.dataset.subtab === subtab;
        btn.style.color = isActive ? C.purple : C.textDim;
        btn.style.borderBottom = isActive ? `2px solid ${C.purple}` : '2px solid transparent';
        btn.style.fontWeight = isActive ? '900' : '400';
        btn.style.textShadow = isActive ? `0 0 6px ${C.purple}88` : 'none';
    });
    renderActivePane();
}
function renderActivePane() {
    ['roster','madame-compat','madame-saju','fortune','settings'].forEach(p => {
        const el = document.getElementById('cl-pane-' + p);
        if (el) el.className = 'cl-pane';
    });
    const tab = state.currentTab;
    if (tab === 'roster') { const el = document.getElementById('cl-pane-roster'); if (el) { el.className = 'cl-pane active'; renderRoster(el); } }
    else if (tab === 'madame') {
        if (state.currentMadameSubtab === 'compat') { const el = document.getElementById('cl-pane-madame-compat'); if (el) { el.className = 'cl-pane active'; renderMadameCompat(el); } }
        else if (state.currentMadameSubtab === 'saju') { const el = document.getElementById('cl-pane-madame-saju'); if (el) { el.className = 'cl-pane active'; renderMadameSaju(el); } }
    }
    else if (tab === 'fortune') { const el = document.getElementById('cl-pane-fortune'); if (el) { el.className = 'cl-pane active'; renderFortune(el); } }
    else if (tab === 'settings') { const el = document.getElementById('cl-pane-settings'); if (el) { el.className = 'cl-pane active'; renderSettings(el); } }
}

// ═══════════════════════════════════════════
// 캐릭터 탭
// ═══════════════════════════════════════════
function renderRoster(container) {
    const settings = getSettings();
    if (state.rosterView === 'add') { renderAddChar(container); return; }
    if (state.rosterView === 'detail' && state.detailCharId) { renderCharDetail(container); return; }

    const sections = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        const cards = group.map(char => {
            const total = getTotal(char);
            return `<div style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid ${genderColor(char.gender)};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px" class="cl-char-card" data-id="${char.id}">
                ${renderAvatar(char.name, char.gender, 42)}
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;color:${C.textBright};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(char.name)}</div>
                    <div style="font-size:10px;color:${C.textDim};margin-top:2px">${esc(char.parsed?.job || '—')} · ${esc(char.parsed?.location || '—')}</div>
                </div>
                ${renderMiniStats(char.stats)}
                ${renderTotalPow(total)}
            </div>`;
        }).join('');
        return renderDivider(g.label, genderColor(g.id)) + cards;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        ${settings.roster.length ? sections : `<div style="text-align:center;color:${C.textDim};font-size:12px;padding:24px 0">등록된 캐릭터 없음</div>`}
        <button id="cl-add-btn" style="width:100%;background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:9px;cursor:pointer;color:${C.accent};font-size:12px;font-weight:700;margin-bottom:8px">＋ 캐릭터 등록</button>
        <div style="display:flex;gap:8px">
            <button id="cl-import-chars" style="flex:1;background:none;border:1px dashed ${C.border};border-radius:2px;padding:7px;cursor:pointer;color:${C.textDim};font-size:10px">ST 캐릭터</button>
            <button id="cl-import-persona" style="flex:1;background:none;border:1px dashed ${C.border};border-radius:2px;padding:7px;cursor:pointer;color:${C.textDim};font-size:10px">페르소나</button>
        </div>
    </div>`;

    container.querySelector('#cl-add-btn')?.addEventListener('click', () => { state.rosterView = 'add'; renderActivePane(); });
    container.querySelectorAll('.cl-char-card').forEach(card => card.addEventListener('click', () => { state.detailCharId = card.dataset.id; state.rosterView = 'detail'; renderActivePane(); }));
    container.querySelector('#cl-import-chars')?.addEventListener('click', importSTChars);
    container.querySelector('#cl-import-persona')?.addEventListener('click', importPersonas);
}

function importSTChars() {
    const ctx = SillyTavern.getContext();
    const chars = ctx.characters || [];
    if (!chars.length) { toastr.warning('불러올 캐릭터가 없습니다'); return; }
    const list = chars.map((c, i) => {
        const avatar = c.avatar ? `/thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}` : null;
        return `<div class="cl-imp" data-idx="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid ${C.border};color:${C.text};font-size:12px;display:flex;align-items:center;gap:10px">
            ${avatar ? `<img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid ${C.border};flex-shrink:0" onerror="this.style.display='none'">` : `<div style="width:36px;height:36px;border-radius:50%;background:${C.bgCard};border:1px solid ${C.border};flex-shrink:0"></div>`}
            <div>
                <div style="font-weight:700">${esc(c.name)}</div>
                <div style="font-size:10px;color:${C.textDim}">${esc(c.description?.slice(0,40) || '')}${c.description?.length > 40 ? '...' : ''}</div>
            </div>
        </div>`;
    }).join('');
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(`<div style="max-height:400px;overflow-y:auto;background:${C.bgDeep}">${list}</div>`, POPUP_TYPE.TEXT, '', { okButton: '닫기' });
    setTimeout(() => {
        document.querySelectorAll('.cl-imp').forEach(item => item.addEventListener('click', () => {
            const c = chars[parseInt(item.dataset.idx)];
            const raw = [c.description, c.personality, c.scenario, c.first_mes].filter(Boolean).join('\n\n');
            addCharFromImport(c.name, raw, 'female'); popup.hide?.();
        }));
    }, 100);
    popup.show();
}

async function importPersonas() {
    try {
        const { power_user } = await import('/scripts/power-user.js');
        const { getUserAvatars } = await import('/scripts/personas.js');
        const personas = power_user?.personas || {};
        const descriptions = power_user?.persona_descriptions || {};
        const entries = Object.entries(personas).filter(([, name]) => name && name !== '[Unnamed Persona]');
        if (!entries.length) { toastr.warning('등록된 페르소나가 없습니다'); return; }
        const list = entries.map(([file, name]) => {
            const avatar = `/thumbnail?type=persona&file=${encodeURIComponent(file)}`;
            const descObj = descriptions[file] || {};
            const title = descObj.title || '';
            const descPreview = (typeof descObj === 'string' ? descObj : descObj.description || '').split('\n')[0].slice(0, 40);
            return `<div class="cl-imp-p" data-file="${esc(file)}" data-name="${esc(name)}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid ${C.border};color:${C.text};font-size:12px;display:flex;align-items:center;gap:10px">
                <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid ${C.border};flex-shrink:0" onerror="this.style.display='none'">
                <div>
                    <div style="font-weight:700">${esc(name)}${title ? ` <span style="font-size:10px;color:${C.purple};font-weight:400">· ${esc(title)}</span>` : ''}</div>
                    <div style="font-size:10px;color:${C.textDim}">${esc(descPreview)}</div>
                </div>
            </div>`;
        }).join('');
        const { Popup, POPUP_TYPE } = SillyTavern.getContext();
        const popup = new Popup(`<div style="max-height:400px;overflow-y:auto;background:${C.bgDeep}">${list}</div>`, POPUP_TYPE.TEXT, '', { okButton: '닫기' });
        setTimeout(() => {
            document.querySelectorAll('.cl-imp-p').forEach(item => item.addEventListener('click', () => {
                const file = item.dataset.file, name = item.dataset.name;
                const descObj = descriptions[file] || {};
                const desc = typeof descObj === 'string' ? descObj : (descObj.description || '');
                addCharFromImport(name, `페르소나 이름: ${name}\n${desc || '(설명 없음)'}`, 'female'); popup.hide?.();
            }));
        }, 100);
        popup.show();
    } catch (e) { toastr.error(`페르소나 로드 실패: ${e.message}`); }
}

function detectGenderFromText(text) {
    const male = /\b(he|him|his|boy|man|male|men|son|brother|husband|uncle|father|grandfather|boyfriend|mr\b|sir\b|남자|남성|남편|아들|형|오빠|남|소년|청년|아저씨|아버지|할아버지|남친|그는|그가|그를|그의)\b/i;
    const female = /\b(she|her|hers|girl|woman|female|women|daughter|sister|wife|aunt|mother|grandmother|girlfriend|ms\b|mrs\b|여자|여성|아내|딸|언니|누나|여|소녀|아가씨|어머니|할머니|여친|그녀는|그녀가|그녀를|그녀의)\b/i;
    const maleCount = (text.match(new RegExp(male.source, 'gi')) || []).length;
    const femaleCount = (text.match(new RegExp(female.source, 'gi')) || []).length;
    if (maleCount > femaleCount) return 'male';
    if (femaleCount > maleCount) return 'female';
    return null; // 감지 못하면 null
}

async function addCharFromImport(name, raw, genderHint) {
    const settings = getSettings();
    if (settings.roster.find(c => c.name === name)) { toastr.info(`${name}은 이미 등록됨`); return; }
    toastr.info(`${name} 분석 중...`);

    // 텍스트 기반 사전 성별 감지
    const detectedGender = detectGenderFromText(raw) || genderHint || 'female';

    toastr.clear();
    showLoading(null, 'analyze');
    try {
        const parsed = await analyzeCharSheet(name, detectedGender, raw);
        hideLoading();
        const finalGender = parsed.gender || detectedGender;
        settings.roster.push({
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            gender: finalGender, name,
            parsed: { ...parsed, raw, gender: finalGender }, stats: parsed.stats,
        });
        save(); toastr.success(`${name} 등록 완료! (${finalGender === 'female' ? '여성' : '남성'})`);
        if (state.rosterView === 'list') renderActivePane();
    } catch (e) { hideLoading(); toastr.error(`${name} 분석 실패: ${e.message}`); }
}

function renderAddChar(container) {
    container.innerHTML = `<div style="padding:14px">
        <button style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;margin-bottom:12px;padding:0" id="cl-add-back">◀ 뒤로</button>
        <div style="font-size:13px;font-weight:700;color:${C.accent};letter-spacing:1px;margin-bottom:16px">◆ 캐릭터 등록 ◆</div>
        <div style="font-size:9px;color:${C.textDim};margin-bottom:6px;letter-spacing:1px">성별</div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
            ${GENDER_SECTIONS.map(g => `<button class="cl-gender-btn" data-gender="${g.id}" style="flex:1;background:${C.bgCard};border:2px solid ${C.border};border-radius:2px;padding:8px;cursor:pointer;color:${C.textDim};font-weight:700;font-size:12px">${g.label}</button>`).join('')}
        </div>
        <div style="font-size:9px;color:${C.textDim};margin-bottom:6px;letter-spacing:1px">이름</div>
        <input id="cl-add-name" placeholder="캐릭터 이름" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px 10px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;margin-bottom:14px">
        <div style="font-size:9px;color:${C.textDim};margin-bottom:6px;letter-spacing:1px">캐릭터 시트</div>
        <textarea id="cl-add-raw" rows="7" placeholder="ST 카드, 고급정의, 페르소나 시트 등 붙여넣기" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px 10px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;resize:vertical;line-height:1.7"></textarea>
        <div style="font-size:10px;color:${C.textDim};margin:6px 0 16px">※ AI가 시트 읽고 능력치 산출. 성별은 시트 내용 기반 자동 감지.</div>
        <div style="display:flex;gap:8px">
            <button id="cl-add-cancel" style="flex:1;background:none;border:1px solid ${C.border};border-radius:2px;padding:9px;cursor:pointer;color:${C.textDim};font-size:12px">취소</button>
            <button id="cl-add-submit" style="flex:1;background:${C.accent};border:none;border-radius:2px;padding:9px;cursor:pointer;color:#fff;font-size:12px;font-weight:700">분석 시작 ▶</button>
        </div>
    </div>`;

    let selectedGender = 'female';
    const btns = container.querySelectorAll('.cl-gender-btn');
    function selGender(g) {
        selectedGender = g;
        btns.forEach(btn => {
            const gc = genderColor(btn.dataset.gender);
            btn.style.background = btn.dataset.gender === g ? gc + '22' : C.bgCard;
            btn.style.borderColor = btn.dataset.gender === g ? gc : C.border;
            btn.style.color = btn.dataset.gender === g ? gc : C.textDim;
        });
    }
    selGender('female');
    btns.forEach(btn => btn.addEventListener('click', () => selGender(btn.dataset.gender)));
    container.querySelector('#cl-add-back')?.addEventListener('click', () => { state.rosterView = 'list'; renderActivePane(); });
    container.querySelector('#cl-add-cancel')?.addEventListener('click', () => { state.rosterView = 'list'; renderActivePane(); });
    container.querySelector('#cl-add-submit')?.addEventListener('click', async () => {
        const name = container.querySelector('#cl-add-name')?.value.trim();
        const raw = container.querySelector('#cl-add-raw')?.value.trim();
        if (!name || !raw) { toastr.warning('이름과 캐릭터 시트를 입력하세요'); return; }
        await addCharFromImport(name, raw, selectedGender);
        state.rosterView = 'list'; renderActivePane();
    });
}

function renderCharDetail(container) {
    const settings = getSettings();
    const char = settings.roster.find(c => c.id === state.detailCharId);
    if (!char) { state.rosterView = 'list'; renderActivePane(); return; }
    const total = getTotal(char), rank = getRank(total), gc = genderColor(char.gender);
    let subTab = 'stats';

    function doRender() {
        const statHTML = Object.entries(char.stats).map(([s, v]) => `
            <div style="margin-bottom:9px">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px">
                    <span style="color:${C.text}">${STAT_META[s].label}</span>
                    <span style="color:${STAT_META[s].color};font-weight:900">${v}</span>
                </div>
                <div style="height:5px;background:${C.bgDeep};border-radius:1px;overflow:hidden">
                    <div style="width:${v}%;height:100%;background:${STAT_META[s].color}"></div>
                </div>
            </div>`).join('');
        const intimacy = char.parsed?.intimacy || {};
        const profileHTML = [
            ['나이', char.parsed?.age], ['직업', char.parsed?.job], ['지역', char.parsed?.location],
            ['외형', char.parsed?.appearance], ['성격', char.parsed?.personality], ['특징', char.parsed?.traits],
        ].map(([k, v]) =>
            `<div style="border-bottom:1px solid ${C.border};padding-bottom:10px;margin-bottom:10px">
                <div style="font-size:9px;color:${C.textDim};margin-bottom:4px;letter-spacing:2px">${k}</div>
                <div style="font-size:12px;color:${C.text};line-height:1.7">${esc(v || '—')}</div>
            </div>`
        ).join('') + `
        <div style="border:1px solid #5a3030;border-radius:2px;padding:12px;margin-top:6px;background:#1a0f0f">
            <div style="font-size:10px;color:#c07070;font-weight:700;margin-bottom:10px;letter-spacing:1px">🔞 NSFW 정보</div>
            ${[['신체', intimacy.physique], ['끌림', intimacy.desire], ['성향', intimacy.style], ['취향', intimacy.preference]].map(([k, v]) =>
                `<div style="border-bottom:1px solid #3a1f1f;padding-bottom:8px;margin-bottom:8px">
                    <div style="font-size:9px;color:#9a6060;margin-bottom:4px;letter-spacing:1px">${k}</div>
                    <div style="font-size:12px;color:#cc9988;line-height:1.7">${esc(v || '정보 없음')}</div>
                </div>`
            ).join('')}
        </div>`;

        container.innerHTML = `
        <div style="background:${C.bgDeep};border-bottom:1px solid ${C.border};padding:14px">
            <button style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;margin-bottom:10px;padding:0" id="cl-detail-back">◀ 목록으로</button>
            <div style="display:flex;gap:14px;align-items:center">
                <div style="position:relative">${renderAvatar(char.name, char.gender, 60)}</div>
                <div style="flex:1">
                    <div style="font-size:9px;padding:2px 8px;border-radius:2px;background:${gc}22;border:1px solid ${gc}66;color:${gc};display:inline-block;margin-bottom:4px;font-size:9px">${char.gender === 'female' ? '♀ 여성' : '♂ 남성'}</div>
                    <div style="font-size:18px;font-weight:700;color:${C.textBright}">${esc(char.name)}</div>
                    <div style="font-size:11px;color:${C.textDim};margin-top:3px">${esc(char.parsed?.age || '—')}세 · ${esc(char.parsed?.job || '—')}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:24px;font-weight:900;color:${rank.color};font-family:monospace">${total}</div>
                    <div style="font-size:9px;color:${rank.color}">${rank.label}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px">
                <button id="cl-gender-toggle" style="flex:1;background:${gc}22;border:1px solid ${gc}66;border-radius:2px;padding:6px;cursor:pointer;color:${gc};font-size:11px">${char.gender === 'female' ? '♂ 남성으로 변경' : '♀ 여성으로 변경'}</button>
                <button id="cl-detail-reanalyze" style="padding:6px 12px;background:none;border:1px solid ${C.accent}66;border-radius:2px;cursor:pointer;color:${C.accent};font-size:11px">🔄 재분석</button>
                <button id="cl-detail-delete" style="padding:6px 12px;background:none;border:1px solid ${C.border};border-radius:2px;cursor:pointer;color:${C.textDim};font-size:11px">🗑 삭제</button>
            </div>
        </div>
        <div style="display:flex;background:${C.bgDeep};border-bottom:1px solid ${C.border}">
            ${['stats','profile','raw'].map(id => `<button class="cl-subtab" data-subtab="${id}" style="flex:1;background:none;border:none;border-bottom:2px solid ${subTab===id?C.accent:'transparent'};padding:9px 0;cursor:pointer;color:${subTab===id?C.accent:C.textDim};font-size:11px;font-weight:${subTab===id?'700':'400'}">${id==='stats'?'능력치':id==='profile'?'프로필':'원본'}</button>`).join('')}
        </div>
        <div style="padding:14px">
            ${subTab==='stats'?statHTML:subTab==='profile'?profileHTML:`<div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:12px;font-size:11px;color:${C.textDim};line-height:1.8;white-space:pre-wrap;word-break:break-word">${esc(char.parsed?.raw||'—')}</div>`}
        </div>`;

        container.querySelector('#cl-detail-back')?.addEventListener('click', () => { state.rosterView='list'; renderActivePane(); });
        container.querySelectorAll('.cl-subtab').forEach(btn => btn.addEventListener('click', () => { subTab=btn.dataset.subtab; doRender(); }));
        container.querySelector('#cl-gender-toggle')?.addEventListener('click', () => {
            char.gender = char.gender === 'female' ? 'male' : 'female';
            save(); doRender(); toastr.success(`성별 → ${char.gender === 'female' ? '여성' : '남성'}`);
        });
        container.querySelector('#cl-detail-reanalyze')?.addEventListener('click', async () => {
            if (!char.parsed?.raw) { toastr.warning('원본 시트가 없습니다'); return; }
            toastr.info(`${char.name} 재분석 중...`);
            try {
                const newParsed = await analyzeCharSheet(char.name, char.gender, char.parsed.raw);
                const s = getSettings();
                const target = s.roster.find(c => c.id === char.id);
                if (target) {
                    target.parsed = { ...newParsed, raw: char.parsed.raw };
                    target.stats = newParsed.stats;
                    target.gender = newParsed.gender || char.gender;
                    save();
                    // char 참조 업데이트
                    Object.assign(char, target);
                    doRender();
                    toastr.success(`${char.name} 재분석 완료!`);
                }
            } catch (e) { toastr.error(`재분석 실패: ${e.message}`); }
        });
        container.querySelector('#cl-detail-delete')?.addEventListener('click', async () => {
            const { Popup, POPUP_RESULT } = SillyTavern.getContext();
            const confirmed = await Popup.show.confirm('삭제 확인', `${char.name}을(를) 삭제하시겠습니까?`);
            if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
                const s = getSettings(); s.roster = s.roster.filter(c => c.id !== char.id); save();
                state.rosterView='list'; renderActivePane(); toastr.success(`${char.name} 삭제 완료`);
            }
        });
    }
    doRender();
}

// ═══════════════════════════════════════════
// 배틀 탭
// ═══════════════════════════════════════════
function renderMadameSaju(container) {
    const settings = getSettings();
    if (state.sajuView === 'result' && state.activeSajuId) { renderSajuResult2(container); return; }
    if (state.sajuView === 'setup') { renderSajuSetup(container); return; }

    // 목록
    const list = (settings.sajuList || []).map(s => `
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid ${C.gold};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px" class="cl-saju-rec" data-id="${s.id}">
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(s.charName)}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${esc(s.dayPillar || '—')} · ${esc(s.createdAt || '')}</div>
            </div>
            ${s.hasBirth ? `<span style="font-size:9px;padding:2px 6px;background:#ffaa0022;border:1px solid #ffaa0066;color:#ffaa00;border-radius:2px;white-space:nowrap">실제사주</span>` : `<span style="font-size:9px;padding:2px 6px;background:${C.purple}22;border:1px solid ${C.purple}44;color:${C.purple};border-radius:2px;white-space:nowrap">창작사주</span>`}
            <button class="cl-saju-del" data-id="${s.id}" style="background:none;border:1px solid ${C.border};border-radius:2px;padding:3px 7px;cursor:pointer;color:${C.textDim};font-size:10px">🗑</button>
        </div>`).join('') || `<div style="text-align:center;color:${C.textDim};font-size:12px;padding:24px 0">풀이된 사주가 없구나...</div>`;

    container.innerHTML = `<div style="padding:14px">
        <div style="background:linear-gradient(180deg,#1a0020,#0d0015);border:1px solid ${C.gold}66;border-radius:2px;padding:12px;text-align:center;margin-bottom:14px;animation:cl-pulse-gold 2s ease-in-out infinite">
            <div style="font-size:9px;color:#664422;letter-spacing:4px;margin-bottom:4px;font-family:monospace">◆◆◆◆◆◆◆</div>
            <div style="font-size:14px;font-weight:700;color:${C.gold};text-shadow:0 0 10px ${C.gold}88">챗씨부인 사주풀이</div>
            <div style="font-size:10px;color:#886633;margin-top:3px;font-family:'Noto Serif KR',serif">캐릭터의 운명을 사주로 풀어드립니다</div>
            <div style="font-size:9px;color:#664422;letter-spacing:4px;margin-top:4px;font-family:monospace">◆◆◆◆◆◆◆</div>
        </div>
        ${renderDivider('사주 기록', C.gold)}
        ${list}
        <button id="cl-saju-new" style="width:100%;background:${C.gold}22;border:1px solid ${C.gold}88;border-radius:2px;padding:9px;cursor:pointer;color:${C.gold};font-size:12px;font-weight:700">🪬 사주 풀기</button>
    </div>`;

    container.querySelectorAll('.cl-saju-rec').forEach(rec => rec.addEventListener('click', () => {
        state.activeSajuId = rec.dataset.id; state.sajuView = 'result'; renderActivePane();
    }));
    container.querySelectorAll('.cl-saju-del').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = getSettings(); s.sajuList = (s.sajuList || []).filter(x => x.id !== btn.dataset.id); save();
        renderMadameSaju(container);
    }));
    container.querySelector('#cl-saju-new')?.addEventListener('click', () => {
        state.sajuCharId = null; state.sajuView = 'setup'; renderActivePane();
    });
}

function renderSajuSetup(container) {
    const settings = getSettings();
    const roster = settings.roster;
    const selectedId = state.sajuCharId || null;
    const selectedChar = roster.find(c => c.id === selectedId) || null;

    const charRows = GENDER_SECTIONS.map(g => {
        const group = roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${genderColor(g.id)};margin-bottom:6px;letter-spacing:2px">${g.label}</div>
            ${group.map(char => {
                const isSel = char.id === selectedId;
                return `<div class="cl-saju-sel" data-id="${char.id}" style="background:${isSel?C.gold+'22':C.bgCard};border:2px solid ${isSel?C.gold:C.border};border-radius:2px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 30)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${isSel?C.textBright:C.text}">${esc(char.name)}</div><div style="font-size:10px;color:${C.textDim}">${esc(char.parsed?.age||'—')}세 · ${esc(char.parsed?.job||'—')}</div></div>
                    ${isSel?`<span style="color:${C.gold};text-shadow:0 0 8px ${C.gold}">✦</span>`:''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button id="cl-saju-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:700;color:${C.gold}">사주 풀 캐릭터 선택</span>
        </div>
        ${charRows || `<div style="color:${C.textDim};font-size:12px;padding:12px 0">등록된 캐릭터 없음</div>`}
        <button id="cl-saju-go" ${!selectedChar?'disabled':''} style="width:100%;background:${selectedChar?C.gold+'22':'#1a1000'};border:1px solid ${selectedChar?C.gold+'88':C.border};border-radius:2px;padding:9px;cursor:${selectedChar?'pointer':'not-allowed'};color:${selectedChar?C.gold:C.textDim};font-size:12px;font-weight:700">
            ${selectedChar?`🪬 ${esc(selectedChar.name)}의 사주 풀기`:'캐릭터를 선택하세요'}
        </button>
    </div>`;

    container.querySelector('#cl-saju-back')?.addEventListener('click', () => { state.sajuView='list'; renderActivePane(); });
    container.querySelectorAll('.cl-saju-sel').forEach(el => el.addEventListener('click', () => {
        state.sajuCharId = el.dataset.id; renderSajuSetup(container);
    }));
    container.querySelector('#cl-saju-go')?.addEventListener('click', async () => {
        if (!selectedChar) return;
        // 생년월일 감지 여부 미리 표시
        const raw = selectedChar.parsed?.raw || '';
        const hasBirth = /(?:생년월일|birth|born|birthday|dob)[^\d]*\d{4}|\d{4}[.\-\/년]\s*\d{1,2}[.\-\/월]\s*\d{1,2}/i.test(raw);
        toastr.info(hasBirth ? '생년월일 감지 — 실제 사주 계산 중...' : '챗씨부인이 사주를 지어드립니다...');
        showLoading(null, 'saju');
        try {
            const resultText = await runSajuPrompt(selectedChar);
            const dayM = resultText.match(/일주[：:]\s*(.+)/);
            const dayPillar = dayM ? dayM[1].trim() : '';
            const session = {
                id: 'saju_' + Date.now(),
                charId: selectedChar.id,
                charName: selectedChar.name,
                dayPillar,
                hasBirth,
                resultText,
                createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.'),
            };
            const s = getSettings();
            if (!s.sajuList) s.sajuList = [];
            s.sajuList.unshift(session); save();
            state.activeSajuId = session.id; state.sajuView = 'result';
            hideLoading(); renderActivePane();
        } catch (e) { hideLoading(); toastr.error(`사주풀이 실패: ${e.message}`); }
    });
}

function renderSajuResult2(container) {
    const settings = getSettings();
    const session = (settings.sajuList || []).find(s => s.id === state.activeSajuId);
    if (!session) { state.sajuView='list'; renderActivePane(); return; }
    const char = settings.roster.find(c => c.id === session.charId);

    container.innerHTML = `
    <div style="background:linear-gradient(180deg,#1a0020,#0d0015);border-bottom:2px solid ${C.gold}66;padding:14px;text-align:center;position:relative">
        <button id="cl-sr-back" style="position:absolute;top:14px;left:14px;background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px">◀ 목록</button>
        <div style="font-size:10px;color:#664422;letter-spacing:2px;margin-bottom:6px;font-family:'Noto Serif KR',serif">✦ 사주를 풀어드리리다 ✦</div>
        ${char ? renderAvatar(char.name, char.gender, 44) : ''}
        <div style="font-size:15px;font-weight:700;color:${C.gold};margin-top:8px;text-shadow:0 0 10px ${C.gold}88">${esc(session.charName)}</div>
        ${session.dayPillar ? `<div style="font-size:11px;color:#886633;margin-top:4px;font-family:'Noto Serif KR',serif">일주: ${esc(session.dayPillar)}</div>` : ''}
    </div>
    <div style="padding:14px">
        ${renderSajuAccordions(session.resultText)}
    </div>`;

    container.querySelector('#cl-sr-back')?.addEventListener('click', () => { state.sajuView='list'; renderActivePane(); });
    container.querySelectorAll('.cl-accordion-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
}

function renderSajuAccordions(text) {
    const sections = [
        { icon: '🔮', key: '사주팔자',       summary: '년주·월주·일주·시주' },
        { icon: '🌊', key: '오행의 기운',    summary: '지배하는 기운과 부족한 기운' },
        { icon: '⚡', key: '이 자의 본질',   summary: '핵심 본질과 공략 포인트' },
        { icon: '🌟', key: '필요한 기운',    summary: '약점과 공략 키' },
        { icon: '🔥', key: '욕망의 기운',    summary: '잠자리 + 금전 스타일' },
        { icon: '😤', key: '기질의 기운',    summary: '화 + 술버릇 + 습관' },
        { icon: '💕', key: '인연의 기운',    summary: '연애운 + 인간관계' },
        { icon: '📅', key: '지금 이 시기의 기운', summary: '현재 운세' },
        { icon: '✨', key: '챗씨부인의 한마디', summary: '공략 핵심 한 줄' },
    ];
    const allIcons = sections.map(s => s.icon);
    return sections.map(s => {
        const others = allIcons.filter(e => e !== s.icon).join('|');
        const m = text.match(new RegExp(s.icon + '[^\\n]*【' + s.key + '】([\\s\\S]*?)(?=' + others + '|$)', 'u'));
        const content = m ? m[1].trim() : '';
        return renderAccordion(
            s.icon, s.key, s.summary,
            `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(content || '—')}</div>`
        );
    }).join('');
}

async function runSajuPrompt(char) {
    const raw = char.parsed?.raw || '';
    const birthMatch = raw.match(/(?:생년월일|birth|born|birthday|dob)[^\d]*(\d{4})[.\-\/\s년]?\s*(\d{1,2})[.\-\/\s월]?\s*(\d{1,2})/i)
        || raw.match(/(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})/);
    const birthTime = raw.match(/(?:생시|birth\s*time|born\s*at|시간)[^\d]*(\d{1,2})[:시]/i);
    const hasBirth = !!birthMatch;
    const birthInfo = hasBirth
        ? `실제 생년월일: ${birthMatch[1]}년 ${birthMatch[2]}월 ${birthMatch[3]}일${birthTime ? ` ${birthTime[1]}시` : ' (생시 미상)'}\n→ 이 생년월일을 기반으로 만세력 기준 정확한 천간지지를 계산하여 풀이하라.`
        : '생년월일 정보 없음 → 캐릭터의 성격/특징에 가장 잘 맞는 사주팔자를 챗씨부인이 직접 부여하고 풀이하라.';

    const slot = getPromptSlot('saju');
    const prompt = fillTpl(slot.user, {
        name: char.name,
        age: char.parsed?.age || '불명',
        job: char.parsed?.job || '불명',
        personality: char.parsed?.personality || '',
        traits: char.parsed?.traits || '',
        appearance: char.parsed?.appearance || '',
        birthInfo,
    });
    return await callAI(prompt, slot.system);
}

// ═══════════════════════════════════════════
// 운명점 전용 AI 호출 (독립 프로필)
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// 운명점 — 챗씨부인 채팅방
// ═══════════════════════════════════════════

function stripInfoBlocks(text) {
    return (text || '')
        .replace(/<Scene_Info[^>]*>[\s\S]*?<\/Scene_Info>/gi, '')
        .replace(/<scene_info[^>]*>[\s\S]*?<\/scene_info>/gi, '')
        .replace(/<[^>]{1,200}>/g, '')
        .replace(/\[System[^\]]*\]/gi, '')
        .replace(/\(OOC[^)]*\)/gi, '')
        .replace(/【[^】]{1,200}】/g, '')
        .replace(/
{3,}/g, '\n\n')
        .trim();
}

function renderFortune(container) {
    const settings = getSettings();
    const rooms = settings.fortuneRooms || [];

    const list = rooms.map(r => `
        <div class="cl-froom" data-id="${r.id}" style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid #ffcc00;border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="font-size:20px">${r.type === 'couple' ? '💑' : '🙋'}</div>
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(r.title)}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${esc(r.createdAt || '')} · 대화 ${(r.messages||[]).length}개</div>
            </div>
            <button class="cl-froom-del" data-id="${r.id}" style="background:none;border:1px solid ${C.border};border-radius:2px;padding:3px 7px;cursor:pointer;color:${C.textDim};font-size:10px">🗑</button>
        </div>`).join('') || `<div style="text-align:center;color:${C.textDim};font-size:12px;padding:24px 0">채팅방이 없습니다</div>`;

    container.innerHTML = `<div style="padding:14px">
        <div style="background:linear-gradient(180deg,#1a0020,#0d0015);border:1px solid #ffcc0066;border-radius:2px;padding:14px;text-align:center;margin-bottom:14px" class="cl-pulse-gold">
            <div style="font-size:15px;font-weight:700;color:#ffcc00">🔯 챗씨부인 점집</div>
            <div style="font-size:10px;color:#886633;margin-top:4px">재미로 보는 점입니다 · 실제 점술이 아닙니다</div>
        </div>
        ${renderDivider('채팅방 목록', '#ffcc00')}
        ${list}
        <div style="display:flex;gap:8px;margin-top:8px">
            <button id="cl-froom-couple" style="flex:1;background:#ffcc0022;border:1px solid #ffcc0066;border-radius:2px;padding:9px;cursor:pointer;color:#ffcc00;font-size:11px;font-weight:700">💑 커플 사주방</button>
            <button id="cl-froom-personal" style="flex:1;background:${C.purple}22;border:1px solid ${C.purple}66;border-radius:2px;padding:9px;cursor:pointer;color:${C.purple};font-size:11px;font-weight:700">🙋 개인 상담방</button>
        </div>
    </div>`;

    container.querySelectorAll('.cl-froom').forEach(el => el.addEventListener('click', () => {
        const room = (getSettings().fortuneRooms||[]).find(r => r.id === el.dataset.id);
        if (room) renderFortuneChatRoom(container, room.id);
    }));
    container.querySelectorAll('.cl-froom-del').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = getSettings(); s.fortuneRooms = (s.fortuneRooms||[]).filter(r => r.id !== btn.dataset.id); save();
        renderFortune(container);
    }));
    container.querySelector('#cl-froom-couple')?.addEventListener('click', () => renderFortuneNewRoom(container, 'couple'));
    container.querySelector('#cl-froom-personal')?.addEventListener('click', () => renderFortuneNewRoom(container, 'personal'));
}

function renderFortuneNewRoom(container, type) {
    if (type === 'couple') {
        // 커플방 — 바로 생성 후 baseContext 로딩
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        const title = char?.name ? `${char.name} 커플 사주` : '커플 사주방';
        const room = { id: 'froom_' + Date.now(), type: 'couple', title, baseContext: null, messages: [], createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.') };
        const s = getSettings(); if (!s.fortuneRooms) s.fortuneRooms = []; s.fortuneRooms.unshift(room); save();
        renderFortuneChatRoom(container, room.id, true);
    } else {
        // 개인방 — 정보 입력창
        container.innerHTML = `<div style="padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <button id="cl-fp-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀ 뒤로</button>
                <span style="font-size:13px;font-weight:700;color:${C.purple}">🙋 개인 상담방</span>
            </div>
            <div style="font-size:11px;color:${C.textDim};margin-bottom:10px;line-height:1.7">상담받고 싶은 분의 정보를 자유롭게 입력하세요.<br>이름, 생년월일, 고민 등 원하는 내용을 적어주세요.</div>
            <textarea id="cl-fp-info" rows="6" placeholder="예) 이름: 김민지, 1995년 3월 15일생, 여성. 남자친구와 헤어져야 할지 고민 중..." style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:10px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;resize:none;line-height:1.7;margin-bottom:12px"></textarea>
            <button id="cl-fp-start" style="width:100%;background:${C.purple}22;border:1px solid ${C.purple}66;border-radius:2px;padding:10px;cursor:pointer;color:${C.purple};font-size:12px;font-weight:700">🔯 상담방 만들기</button>
        </div>`;
        container.querySelector('#cl-fp-back')?.addEventListener('click', () => renderFortune(container));
        container.querySelector('#cl-fp-start')?.addEventListener('click', () => {
            const info = container.querySelector('#cl-fp-info')?.value?.trim();
            if (!info) { toastr.warning('정보를 입력해주세요'); return; }
            const room = { id: 'froom_' + Date.now(), type: 'personal', title: '개인 상담', baseContext: `[내담자 정보]\n${info}`, messages: [], createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.') };
            const s = getSettings(); if (!s.fortuneRooms) s.fortuneRooms = []; s.fortuneRooms.unshift(room); save();
            renderFortuneChatRoom(container, room.id, false);
        });
    }
}

async function renderFortuneChatRoom(container, roomId, loadBase = false) {
    const settings = getSettings();
    let room = (settings.fortuneRooms||[]).find(r => r.id === roomId);
    if (!room) { renderFortune(container); return; }

    function renderMessages() {
        const msgs = room.messages || [];
        return msgs.map(m => m.role === 'user'
            ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><div style="background:${C.purple}33;border:1px solid ${C.purple}66;border-radius:10px 10px 2px 10px;padding:10px 13px;max-width:80%;font-size:12px;color:${C.textBright};line-height:1.8">${esc(m.content)}</div></div>`
            : `<div style="display:flex;gap:10px;margin-bottom:12px"><div style="font-size:22px;flex-shrink:0">🔯</div><div style="background:${C.bgCard};border:1px solid #ffcc0044;border-radius:2px 10px 10px 10px;padding:10px 13px;max-width:85%;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap">${esc(m.content)}</div></div>`
        ).join('');
    }

    container.innerHTML = `
    <div style="background:linear-gradient(180deg,#1a0020,#0d0015);border-bottom:1px solid #ffcc0044;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0">
        <button id="cl-fc-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀</button>
        <div style="font-size:13px;font-weight:700;color:#ffcc00;flex:1">${esc(room.title)}</div>
        <button id="cl-fc-refresh" title="채팅 다시 읽기" style="background:none;border:1px solid #ffcc0044;border-radius:2px;padding:3px 8px;cursor:pointer;color:#ffcc00;font-size:11px">🔄</button>
    </div>
    <div id="cl-fc-messages" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column">
        ${room.baseContext === null && room.type === 'couple' ? `<div style="text-align:center;padding:20px;color:${C.textDim};font-size:11px">채팅방 정보를 불러오는 중...</div>` : renderMessages()}
    </div>
    <div style="padding:10px 14px;border-top:1px solid ${C.border};display:flex;gap:8px;flex-shrink:0">
        <textarea id="cl-fc-input" rows="2" placeholder="챗씨부인에게 물어보세요..." style="flex:1;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px;color:${C.text};font-size:12px;outline:none;resize:none;line-height:1.6"></textarea>
        <button id="cl-fc-send" style="background:#ffcc0033;border:1px solid #ffcc0088;border-radius:2px;padding:8px 12px;cursor:pointer;color:#ffcc00;font-size:18px">↑</button>
    </div>`;

    // 커플방 baseContext 없으면 로딩
    if (room.type === 'couple' && !room.baseContext) {
        try {
            const slot = getPromptSlot('fortuneBase');
            const baseRaw = await callAIFortune(slot.user, slot.system);
            room.baseContext = stripInfoBlocks(baseRaw);
            // 첫 인사
            const greetSlot = getPromptSlot('fortuneChat');
            const greetSystem = greetSlot.system.replace('{{baseContext}}', room.baseContext);
            const greet = await callAI('처음 오셨네요. 첫 인사를 해주세요.', greetSystem);
            room.messages = [{ role: 'assistant', content: filterPhoneTrigger(greet) }];
            const s = getSettings(); const target = (s.fortuneRooms||[]).find(r => r.id === roomId);
            if (target) { target.baseContext = room.baseContext; target.messages = room.messages; save(); }
            renderFortuneChatRoom(container, roomId, false);
        } catch (e) { toastr.error('기반 정보 로딩 실패'); }
        return;
    }

    // 개인방 첫 인사
    if (room.type === 'personal' && room.messages.length === 0) {
        try {
            const greetSlot = getPromptSlot('fortuneChat');
            const greetSystem = greetSlot.system.replace('{{baseContext}}', room.baseContext || '');
            const greet = await callAI('처음 오셨네요. 내담자 정보를 보고 첫 인사를 해주세요.', greetSystem);
            room.messages = [{ role: 'assistant', content: filterPhoneTrigger(greet) }];
            const s = getSettings(); const target = (s.fortuneRooms||[]).find(r => r.id === roomId);
            if (target) { target.messages = room.messages; save(); }
            renderFortuneChatRoom(container, roomId, false);
        } catch (e) { toastr.error('첫 인사 실패'); }
        return;
    }

    container.querySelector('#cl-fc-back')?.addEventListener('click', () => renderFortune(container));

    container.querySelector('#cl-fc-refresh')?.addEventListener('click', async () => {
        if (room.type !== 'couple') return;
        toastr.info('채팅 다시 읽는 중...');
        try {
            const slot = getPromptSlot('fortuneBase');
            const baseRaw = await callAIFortune(slot.user, slot.system);
            room.baseContext = stripInfoBlocks(baseRaw);
            const s = getSettings(); const target = (s.fortuneRooms||[]).find(r => r.id === roomId);
            if (target) { target.baseContext = room.baseContext; save(); }
            toastr.success('업데이트 완료');
        } catch (e) { toastr.error('새로고침 실패'); }
    });

    const msgEl = container.querySelector('#cl-fc-messages');
    if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;

    const send = async () => {
        const input = container.querySelector('#cl-fc-input');
        const text = input?.value?.trim();
        if (!text) return;
        input.value = '';

        room.messages.push({ role: 'user', content: text });
        const s = getSettings(); const target = (s.fortuneRooms||[]).find(r => r.id === roomId);
        if (target) { target.messages = room.messages; save(); }

        // 메시지 업데이트
        if (msgEl) {
            msgEl.innerHTML = (room.messages||[]).map(m => m.role === 'user'
                ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><div style="background:${C.purple}33;border:1px solid ${C.purple}66;border-radius:10px 10px 2px 10px;padding:10px 13px;max-width:80%;font-size:12px;color:${C.textBright};line-height:1.8">${esc(m.content)}</div></div>`
                : `<div style="display:flex;gap:10px;margin-bottom:12px"><div style="font-size:22px;flex-shrink:0">🔯</div><div style="background:${C.bgCard};border:1px solid #ffcc0044;border-radius:2px 10px 10px 10px;padding:10px 13px;max-width:85%;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap">${esc(m.content)}</div></div>`
            ).join('') + `<div style="text-align:center;padding:10px;color:${C.textDim};font-size:11px">...</div>`;
            msgEl.scrollTop = msgEl.scrollHeight;
        }

        try {
            const slot = getPromptSlot('fortuneChat');
            const system = slot.system.replace('{{baseContext}}', room.baseContext || '');
            const historyMsgs = (room.messages||[]).slice(-20).map(m => ({ role: m.role, content: m.content }));
            const response = await callAIWithHistory(system, historyMsgs);
            const cleaned = filterPhoneTrigger(response);
            room.messages.push({ role: 'assistant', content: cleaned });
            if (target) { target.messages = room.messages; save(); }
            if (msgEl) {
                msgEl.innerHTML = (room.messages||[]).map(m => m.role === 'user'
                    ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><div style="background:${C.purple}33;border:1px solid ${C.purple}66;border-radius:10px 10px 2px 10px;padding:10px 13px;max-width:80%;font-size:12px;color:${C.textBright};line-height:1.8">${esc(m.content)}</div></div>`
                    : `<div style="display:flex;gap:10px;margin-bottom:12px"><div style="font-size:22px;flex-shrink:0">🔯</div><div style="background:${C.bgCard};border:1px solid #ffcc0044;border-radius:2px 10px 10px 10px;padding:10px 13px;max-width:85%;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap">${esc(m.content)}</div></div>`
                ).join('');
                msgEl.scrollTop = msgEl.scrollHeight;
            }
        } catch (e) { toastr.error(`실패: ${e.message}`); }
    };

    container.querySelector('#cl-fc-send')?.addEventListener('click', send);
    container.querySelector('#cl-fc-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
}

async function callAIFortune(prompt, systemPrompt) {
    const ctx = SillyTavern.getContext();
    const result = await ctx.generateQuietPrompt({
        quietPrompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        quietToLoud: true,
        skipWIAN: false,
    });
    return filterPhoneTrigger(result || '');
}

async function callAIWithHistory(system, messages) {
    const ctx = SillyTavern.getContext();
    const settings = getSettings();
    const profileName = settings.selectedProfileName || null;
    if (profileName && ctx.ConnectionManagerRequestService) {
        const profiles = ctx.extensionSettings?.['connectionManager']?.profiles || [];
        const profile = profiles.find(p => p.name === profileName);
        if (profile) {
            const msgs = [{ role: 'user', content: system + '\n\n아래 대화를 이어가세요.' }, ...messages];
            const response = await ctx.ConnectionManagerRequestService.sendRequest(
                profile.id, msgs, settings.maxTokens || 4000,
                { stream: false, extractData: true, includePreset: true, includeInstruct: false }
            );
            let raw = '';
            if (typeof response === 'string') raw = response;
            else if (response?.choices?.[0]?.message?.content) raw = response.choices[0].message.content;
            else if (response?.content?.[0]?.text) raw = response.content[0].text;
            return filterPhoneTrigger(raw);
        }
    }
    const { generateRaw } = ctx;
    const lastMsg = messages[messages.length - 1]?.content || '';
    const result = await generateRaw({ systemPrompt: system, prompt: lastMsg });
    return filterPhoneTrigger(result || '');
}



function renderSettings(container) {
    const settings = getSettings();
    const { extensionSettings } = SillyTavern.getContext();
    const currentProfile = settings.selectedProfileName || '현재 연결 그대로';
    const devUnlocked = settings.devUnlocked || false;

    container.innerHTML = `<div style="padding:14px">
        ${renderDivider('연결 프로필', C.accent)}
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:11px 13px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">🔌</span>
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(currentProfile)}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">확장 탭 설정에서 변경 가능</div>
            </div>
        </div>

        ${renderDivider('AI 설정', C.accent)}
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:12px;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:10px">
                <div style="flex:1">
                    <div style="font-size:12px;color:${C.text};margin-bottom:4px">최대 토큰 수</div>
                    <div style="font-size:10px;color:${C.textDim}">사주/궁합 등 긴 답변이 잘리면 늘려보세요</div>
                </div>
                <input id="cl-max-tokens" type="number" min="1000" max="32000" step="1000" value="${settings.maxTokens || 4000}" style="width:80px;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:6px 8px;color:${C.text};font-size:13px;font-family:monospace;outline:none;text-align:center">
            </div>
        </div>

        ${renderDivider('저장 현황', C.accent)}
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:14px;margin-bottom:14px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:12px">
                <div><div style="font-size:20px;font-weight:900;color:${C.female};font-family:monospace;text-shadow:0 0 8px ${C.female}88">${settings.roster.length}</div><div style="font-size:9px;color:${C.textDim}">캐릭터</div></div>
                <div><div style="font-size:20px;font-weight:900;color:#ff2200;font-family:monospace;text-shadow:0 0 8px #ff220088">${settings.battleList.length}</div><div style="font-size:9px;color:${C.textDim}">배틀</div></div>
                <div><div style="font-size:20px;font-weight:900;color:${C.purple};font-family:monospace;text-shadow:0 0 8px ${C.purple}88">${settings.madameList.length}</div><div style="font-size:9px;color:${C.textDim}">궁합</div></div>
                <div><div style="font-size:20px;font-weight:900;color:#cc44ff;font-family:monospace;text-shadow:0 0 8px #cc44ff88">${(settings.simList||[]).length}</div><div style="font-size:9px;color:${C.textDim}">시뮬</div></div>
                <div><div style="font-size:20px;font-weight:900;color:${C.gold};font-family:monospace;text-shadow:0 0 8px ${C.gold}88">${(settings.sajuList||[]).length}</div><div style="font-size:9px;color:${C.textDim}">사주</div></div>
            </div>
            <button id="cl-clear-all" style="width:100%;background:none;border:1px solid #550033;border-radius:2px;padding:8px;cursor:pointer;color:#aa4466;font-size:11px">🗑 전체 데이터 삭제</button>
        </div>

        <div style="text-align:center;font-size:9px;color:${C.textDim};padding-top:8px;border-top:1px solid ${C.border}">
            Scouter v2.0 · 챗씨부인운명상담소
        </div>
    </div>`;

    container.querySelector('#cl-max-tokens')?.addEventListener('change', e => {
        const val = parseInt(e.target.value);
        if (val >= 1000 && val <= 32000) {
            const s = getSettings(); s.maxTokens = val; save();
            toastr.success(`최대 토큰 ${val}으로 설정됨`);
        }
    });

    // 전체 삭제
    container.querySelector('#cl-clear-all')?.addEventListener('click', async () => {
        const { Popup, POPUP_RESULT } = SillyTavern.getContext();
        const confirmed = await Popup.show.confirm('전체 삭제', '모든 캐릭터, 배틀, 궁합, 사주 데이터를 삭제합니다. 복구 불가.');
        if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
            const s = getSettings(); s.roster=[]; s.battleList=[]; s.madameList=[]; s.sajuList=[]; s.simList=[]; save();
            toastr.success('전체 삭제 완료'); renderSettings(container);
        }
    });
}

// ═══════════════════════════════════════════
// CSS 인젝션
// ═══════════════════════════════════════════
function injectCSS() {
    const style = document.createElement('style');
    style.id = 'scouter-styles';
    style.textContent = `
#scouter-float * { box-sizing: border-box; }
#cl-content::-webkit-scrollbar { width: 4px; }
#cl-content::-webkit-scrollbar-track { background: ${C.bgDeep}; }
#cl-content::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
.cl-pane { display: none; }
.cl-pane.active { display: block; }
#cl-tabs button, #cl-madame-subtabs button {
    background: none; border: none; border-bottom: 2px solid transparent;
    padding: 8px 0; cursor: pointer; color: ${C.textDim};
    font-size: 10px; flex: 1; transition: all 0.1s;
    font-family: inherit; letter-spacing: 0.5px;
}
#cl-madame-subtabs { display: flex; }
.cl-accordion { background: ${C.bgCard}; border: 1px solid ${C.border}; border-radius: 2px; margin-bottom: 8px; overflow: hidden; }
.cl-accordion.open { border-color: ${C.borderLight}; box-shadow: 0 0 10px ${C.purple}22; }
.cl-accordion-header { padding: 11px 13px; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.cl-accordion.open .cl-accordion-header { background: ${C.bgDeep}; }
.cl-accordion-icon { font-size: 15px; }
.cl-accordion-title { flex: 1; font-size: 12px; font-weight: 700; color: ${C.text}; }
.cl-accordion.open .cl-accordion-title { color: ${C.textBright}; }
.cl-accordion-summary { font-size: 10px; color: ${C.textDim}; margin-top: 2px; }
.cl-accordion-arrow { color: ${C.textDim}; font-size: 13px; transition: transform 0.2s; }
.cl-accordion.open .cl-accordion-arrow { transform: rotate(180deg); }
.cl-accordion-body { display: none; padding: 0 13px 13px; border-top: 1px solid ${C.border}; }
.cl-accordion.open .cl-accordion-body { display: block; }

/* 번쩍번쩍 애니메이션 */
@keyframes cl-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
@keyframes cl-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes cl-pulse-gold { 0%,100%{box-shadow:0 0 8px #ffaa0066,0 0 20px #aa006622} 50%{box-shadow:0 0 20px #ffaa00cc,0 0 40px #ff006644} }
@keyframes cl-pulse-purple { 0%,100%{box-shadow:0 0 8px #cc44ff44} 50%{box-shadow:0 0 20px #cc44ffaa,0 0 40px #8800cc44} }
@keyframes cl-glow-red { 0%,100%{text-shadow:0 0 6px #ff220088} 50%{text-shadow:0 0 16px #ff2200ff,0 0 30px #ff880066} }
.cl-blink { animation: cl-blink 1s step-end infinite; }
.cl-shimmer { background:linear-gradient(90deg,#ff4444,#ff9900,#ff66aa,#ff9900,#ff4444); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation:cl-shimmer 2s linear infinite; }
.cl-pulse-gold { animation: cl-pulse-gold 2s ease-in-out infinite; }
.cl-pulse-purple { animation: cl-pulse-purple 2s ease-in-out infinite; }

@media (max-width: 600px) {
    #scouter-float:not(.fortune-mode) {
        width: 100vw !important; height: 100dvh !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        border-radius: 0 !important; resize: none !important;
    }
    #scouter-float.fortune-mode {
        width: min(420px, 95vw) !important;
        resize: both !important;
    }
    #cl-content { overflow-y: scroll !important; -webkit-overflow-scrolling: touch; }
}
    `;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
export async function onActivate() {
    console.log(`[${MODULE_NAME}] 활성화`);
    injectCSS();
    injectLoadingCSS();

    // 원격 prompts.json 로드
    await loadRemotePrompts();

    // 확장 탭 설정 UI
    const { extensionSettings } = SillyTavern.getContext();
    const profiles = extensionSettings?.['connectionManager']?.profiles || [];
    const savedProfile = getSettings().selectedProfileName || '';
    const profileOpts = profiles.map(p => `<option value="${esc(p.name)}" ${p.name===savedProfile?'selected':''}>${esc(p.name)}</option>`).join('');

    const settingsHtml = `<div class="inline-drawer" id="scouter-ext-settings">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🔴 Scouter</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div style="padding:8px;display:flex;flex-direction:column;gap:8px">
                <div style="font-size:0.82rem;color:var(--SmartThemeBodyColor,#ccc)">연결 프로필 선택</div>
                <select id="scouter-profile-select" class="text_pole" style="width:100%">
                    <option value="">현재 연결 그대로 사용</option>
                    ${profileOpts}
                </select>
                <div style="font-size:0.76rem;color:var(--SmartThemeQuoteColor,#aaa)">나머지 기능은 🔴 Scouter 버튼에서</div>
            </div>
        </div>
    </div>`;
    if (!document.getElementById('scouter-ext-settings')) {
        const extTarget = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
        extTarget?.insertAdjacentHTML('beforeend', settingsHtml);
        document.getElementById('scouter-profile-select')?.addEventListener('change', e => {
            const s = getSettings(); s.selectedProfileName = e.target.value || null; save();
            toastr.success(e.target.value ? `"${e.target.value}" 선택됨` : '현재 연결 사용');
        });
    }

    // extensionsMenu 버튼
    // extensionsMenu 버튼 — 중복 방지
    if (!document.getElementById('scouter-wand-btn')) {
        const scouterBtnHtml = `<div id="scouter-wand-btn" title="Scouter — 챗씨부인운명상담소" style="cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px">
            <span>🔴</span><span style="font-size:12px">Scouter</span>
        </div>`;
        const toolbar = document.getElementById('extensionsMenu') ?? document.getElementById('top-bar');
        toolbar?.insertAdjacentHTML('beforeend', scouterBtnHtml);
        document.getElementById('scouter-wand-btn')?.addEventListener('click', toggleFloat);
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.isPanelOpen) closeFloat(); });
    console.log(`[${MODULE_NAME}] 초기화 완료`);
}

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(event_types.APP_READY, async () => { await onActivate(); });
});
