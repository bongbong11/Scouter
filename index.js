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
    roster: [], battleList: [], madameList: [], sajuList: [],
    allowSameGender: false, selectedProfileName: null,
    devUnlocked: false, prompts: null,
};

// ═══════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════
let state = {
    currentTab: 'roster',
    currentMadameSubtab: 'compat',
    rosterView: 'list',
    battleView: 'list',
    madameCompatView: 'list',
    detailCharId: null,
    activeBattleId: null,
    activeMadameId: null,
    battleSetup: { selected: [], condition: '' },
    madameSetup: { selected: [] },
    simSetup: { selected: [], situation: '' },
    simResult: null,
    sajuView: 'list',   // 'list' | 'setup' | 'result'
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
function getTotal(c) { return Object.values(c.stats || {}).reduce((a, b) => a + b, 0); }
function avatarHue(n) { return [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; }
function genderColor(g) { return g === 'female' ? '#c87070' : '#7090b8'; }
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function filterPhoneTrigger(text) {
    return (text || '').replace(/<phone_trigger[^>]*>[\s\S]*?<\/phone_trigger>/gi, '').replace(/---\s*$/, '').trim();
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
                profile.id, messages, 4000,
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

// ═══════════════════════════════════════════
// 프롬프트 실행
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

async function analyzeCombatProfile(char) {
    const slot = getPromptSlot('combatProfile');
    const raw = char.parsed?.raw || [char.parsed?.appearance, char.parsed?.personality, char.parsed?.traits, char.parsed?.job].filter(Boolean).join('\n');
    const prompt = fillTpl(slot.user, { name: char.name, sheet: raw });
    try {
        const result = await callAI(prompt, slot.system);
        return JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch {
        return { physique: char.parsed?.appearance || '', species: '인간', job_combat: char.parsed?.job || '', experience: '', skills: '', strengths: '', weaknesses: '', psychology: char.parsed?.personality || '', background: '' };
    }
}

async function runBattlePrompt(fighters) {
    // 1단계: 파이터별 전투 프로파일 분석
    toastr.info('전투 프로파일 분석 중...');
    const profiles = await Promise.all(fighters.map(f => analyzeCombatProfile(f)));

    // 2단계: 분석 결과 + stats 합쳐서 배틀 프롬프트에 넘김
    const slot = getPromptSlot('combat');
    const fightersText = fighters.map((f, i) => {
        const p = profiles[i];
        return `【${f.name}】
▸ 신체/나이대: ${p.physique}
▸ 종족/존재: ${p.species}
▸ 직업 전투 해석: ${p.job_combat}
▸ 실전 경험: ${p.experience}
▸ 전투 특기: ${p.skills}
▸ 강점: ${p.strengths}
▸ 약점: ${p.weaknesses}
▸ 심리: ${p.psychology}
▸ 과거사: ${p.background}
▸ 능력치 — 전투력: ${f.stats.combat}pt / 언변: ${f.stats.roast}pt / 정신력: ${f.stats.mental}pt / 카리스마: ${f.stats.charisma}pt`;
    }).join('\n\n');

    const { condition } = state.battleSetup;
    const condText = condition?.trim() ? `조건/상황: ${condition}` : '조건 없음 — 그냥 붙여라.';
    return await callAI(fillTpl(slot.user, { fighters: fightersText, condition: condText }), slot.system);
}

async function runCompatPrompt(cast, allowSame) {
    const slot = getPromptSlot('compat');
    const castDesc = cast.map(c => {
        const intimacy = c.parsed?.intimacy || {};
        return `【${c.name}】(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job}, ${c.parsed.location})
성격: ${c.parsed.personality}
특징: ${c.parsed.traits}
외형: ${c.parsed.appearance}
신체: ${intimacy.physique || '정보 없음'}
킨크: ${intimacy.desire || '정보 없음'}
성적 스타일: ${intimacy.style || '정보 없음'}
성적 취향: ${intimacy.preference || '정보 없음'}`;
    }).join('\n\n');
    const isMulti = cast.length >= 3;
    const allSameGender = cast.every(c => c.gender === cast[0].gender);
    const sameGenderMode = allSameGender && !allowSame
        ? `\n⚠️ 동성 캐스트 (동성 허용 OFF): 로맨스 관점이 아닌 관계 궁합(우정/라이벌/앙숙 등)으로 분석할 것. 억지로 로맨스를 만들지 말 것.`
        : '';
    return await callAI(fillTpl(slot.user, {
        castDesc,
        genderNote: allowSame ? '동성 커플도 허용' : '동성 로맨스 비허용',
        structureNote: isMulti ? '3명 이상 — 삼각/다각 구도도 분석' : '1:1 관계 분석',
        multiLine: isMulti ? '\n- 구도의 복잡함' : '',
        triBlock: isMulti ? `🔺 【다각 구도 분석】\n(삼각/폴리 여부, 키맨, 구도. 점쟁이 말투 4-6문장)\n` : '',
        sameGenderMode,
        kinkSection: cast.some(c => c.parsed?.intimacy?.style && c.parsed.intimacy.style !== '정보 없음')
            ? `\n🔞 【성향 궁합】\n(각 캐릭터의 킨크/성향이 서로 어떻게 맞물리는지. 점쟁이 말투로 3-4문장. 맞으면 맞다, 안 맞으면 안 맞다고 직접적으로)`
            : '',
    }), slot.system);
}

async function runScenarioPrompt(cast, compatResult) {
    const slot = getPromptSlot('scenario');
    const castDesc = cast.map(c =>
        `${c.name}(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job}, ${c.parsed.location}): ${c.parsed.personality} / ${c.parsed.traits}`
    ).join('\n');
    return await callAI(fillTpl(slot.user, { castDesc, compatResult: (compatResult || '').slice(0, 800) }), slot.system);
}

async function runSimPrompt(cast, situation) {
    const slot = getPromptSlot('sim');
    const castDesc = cast.map(c =>
        `【${c.name}】(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job})\n성격: ${c.parsed.personality}\n특징: ${c.parsed.traits}`
    ).join('\n\n');
    return await callAI(fillTpl(slot.user, { castDesc, situation: situation || '두 사람이 우연히 마주쳤다.' }), slot.system);
}

const PROMPTS_URL = 'https://raw.githubusercontent.com/bongbong11/Scouter/main/prompts.json';

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
    overlay.style.cssText = `position:absolute;inset:0;background:${C.bg}ee;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px`;
    overlay.innerHTML = `
        <div style="position:relative;width:60px;height:60px">
            <svg viewBox="0 0 60 60" style="width:60px;height:60px;animation:scouter-spin 1.2s linear infinite">
                <circle cx="30" cy="30" r="24" fill="none" stroke="${C.border}" stroke-width="3"/>
                <circle cx="30" cy="30" r="24" fill="none" stroke="${C.accent}" stroke-width="3"
                    stroke-dasharray="40 110" stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px">🔴</div>
        </div>
        <div id="scouter-loading-msg" style="font-size:12px;color:${C.text};font-family:monospace;letter-spacing:1px;text-align:center;max-width:200px;line-height:1.7">${msgs[0]}</div>
        <div style="display:flex;gap:4px">
            <div class="scouter-dot" style="width:6px;height:6px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out infinite"></div>
            <div class="scouter-dot" style="width:6px;height:6px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out 0.2s infinite"></div>
            <div class="scouter-dot" style="width:6px;height:6px;border-radius:50%;background:${C.accent};animation:scouter-dot 1.2s ease-in-out 0.4s infinite"></div>
        </div>`;

    // 기존 로딩 제거
    document.getElementById('scouter-loading')?.remove();

    // 컨텐츠 영역에 오버레이
    const content = document.getElementById('cl-content');
    if (content) {
        content.style.position = 'relative';
        content.appendChild(overlay);
    }

    // 메시지 순환
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
            <button class="cl-tab" data-tab="battle">⚔️ 배틀</button>
            <button class="cl-tab" data-tab="madame">🔮 챗씨부인</button>
            <button class="cl-tab" data-tab="settings">⚙️ 설정</button>
        </div>
        <div id="cl-madame-subtabs" style="display:none;flex-shrink:0;background:#0a0015;border-bottom:1px solid #330055">
            <button class="cl-madame-subtab" data-subtab="compat">💘 궁합</button>
            <button class="cl-madame-subtab" data-subtab="sim">🎲 시뮬</button>
            <button class="cl-madame-subtab" data-subtab="saju">🪬 사주</button>
        </div>
        <div id="cl-content" style="flex:1;overflow-y:auto;overflow-x:hidden">
            <div class="cl-pane" id="cl-pane-roster"></div>
            <div class="cl-pane" id="cl-pane-battle"></div>
            <div class="cl-pane" id="cl-pane-madame-compat"></div>
            <div class="cl-pane" id="cl-pane-madame-sim"></div>
            <div class="cl-pane" id="cl-pane-madame-saju"></div>
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
    const tabColors = { roster: '#ff44aa', battle: '#ff2200', madame: '#cc44ff', settings: '#ffaa00' };
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
    ['roster','battle','madame-compat','madame-sim','madame-saju','settings'].forEach(p => {
        const el = document.getElementById('cl-pane-' + p);
        if (el) el.className = 'cl-pane';
    });
    const tab = state.currentTab;
    if (tab === 'roster') { const el = document.getElementById('cl-pane-roster'); if (el) { el.className = 'cl-pane active'; renderRoster(el); } }
    else if (tab === 'battle') { const el = document.getElementById('cl-pane-battle'); if (el) { el.className = 'cl-pane active'; renderBattle(el); } }
    else if (tab === 'madame') {
        if (state.currentMadameSubtab === 'compat') { const el = document.getElementById('cl-pane-madame-compat'); if (el) { el.className = 'cl-pane active'; renderMadameCompat(el); } }
        else if (state.currentMadameSubtab === 'sim') { const el = document.getElementById('cl-pane-madame-sim'); if (el) { el.className = 'cl-pane active'; renderMadameSim(el); } }
        else if (state.currentMadameSubtab === 'saju') { const el = document.getElementById('cl-pane-madame-saju'); if (el) { el.className = 'cl-pane active'; renderMadameSaju(el); } }
    }
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
function renderBattle(container) {
    const settings = getSettings();
    if (state.battleView === 'result' && state.activeBattleId) { renderBattleResult(container); return; }
    if (state.battleView === 'setup') { renderBattleSetup(container); return; }

    const cards = settings.battleList.map(b => {
        return `<div style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid ${C.accent};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px" class="cl-battle-card" data-id="${b.id}">
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(b.fighters.join(' VS '))}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${esc(b.condition||'조건 없음')}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:11px;color:${C.accent};font-weight:700">🏆 ${esc(b.result)}</div>
                <div style="font-size:9px;color:${C.textDim}">${esc(b.createdAt)}</div>
            </div>
            <button class="cl-battle-del" data-id="${b.id}" style="background:none;border:1px solid ${C.border};border-radius:2px;padding:3px 7px;cursor:pointer;color:${C.textDim};font-size:10px">🗑</button>
        </div>`;
    }).join('') || `<div style="text-align:center;color:${C.textDim};font-size:12px;padding:20px 0">기록 없음</div>`;

    container.innerHTML = `<div style="padding:14px">
        ${renderDivider('배틀 기록', C.accent)}
        ${cards}
        <button id="cl-battle-new" style="width:100%;background:${C.accent};border:none;border-radius:2px;padding:9px;cursor:pointer;color:#fff;font-size:12px;font-weight:700">⚔ 새 배틀</button>
    </div>`;

    container.querySelectorAll('.cl-battle-card').forEach(card => card.addEventListener('click', () => {
        state.activeBattleId = card.dataset.id; state.battleView = 'result'; renderActivePane();
    }));
    container.querySelectorAll('.cl-battle-del').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = getSettings(); s.battleList = s.battleList.filter(b => b.id !== btn.dataset.id); save(); renderBattle(container);
    }));
    container.querySelector('#cl-battle-new')?.addEventListener('click', () => {
        state.battleSetup = { selected: [], category: 'combat', condition: '' }; state.battleView = 'setup'; renderActivePane();
    });
}

function renderBattleSetup(container) {
    const settings = getSettings();
    const { selected, category, condition } = state.battleSetup;
    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${genderColor(g.id)};margin-bottom:6px;letter-spacing:2px">${g.label}</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-sel-char" data-id="${char.id}" style="background:${inSel?C.accent+'22':C.bgCard};border:2px solid ${inSel?C.accent:C.border};border-radius:2px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 32)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel?C.textBright:C.text}">${esc(char.name)}</div><div style="font-size:10px;color:${C.textDim}">${esc(char.parsed?.job||'—')}</div></div>
                    <div style="text-align:right;font-size:10px;color:${C.textDim}">
                        <div>⚔️ ${char.stats.combat}</div>
                        <div>🗣️ ${char.stats.roast}</div>
                    </div>
                    ${inSel?`<div style="color:${C.accent}">✓</div>`:''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button id="cl-battle-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:700;color:${C.accent}">배틀 설정</span>
        </div>
        ${renderDivider('파이터 선택 (2명 이상)', C.accent)}
        ${charRows || `<div style="color:${C.textDim};font-size:12px;padding:12px 0">등록된 캐릭터 없음</div>`}
        ${renderDivider('조건/상황', C.accentDim)}
        <textarea id="cl-battle-condition" rows="3" placeholder="예) 삼각관계 폭로 현장에서 마주침&#10;예) 말다툼으로 번질 것 같은 상황&#10;비워두면 그냥 붙어라" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;resize:none;line-height:1.7;margin-bottom:12px">${esc(condition)}</textarea>
        <button id="cl-battle-start" ${selected.length<2?'disabled':''} style="width:100%;background:${selected.length>=2?C.accent:'#2a1e12'};border:none;border-radius:2px;padding:9px;cursor:${selected.length>=2?'pointer':'not-allowed'};color:${selected.length>=2?'#fff':C.textDim};font-size:12px;font-weight:700">
            ${selected.length<2?`파이터 ${Math.max(0,2-selected.length)}명 더 필요`:`⚡ ${selected.length}명 배틀 분석`}
        </button>
    </div>`;

    container.querySelector('#cl-battle-back')?.addEventListener('click', () => { state.battleView='list'; renderActivePane(); });
    container.querySelectorAll('.cl-sel-char').forEach(el => el.addEventListener('click', () => {
        const char = getSettings().roster.find(c => c.id === el.dataset.id);
        if (!char) return;
        const idx = state.battleSetup.selected.findIndex(c => c.id === el.dataset.id);
        if (idx >= 0) state.battleSetup.selected.splice(idx, 1); else state.battleSetup.selected.push(char);
        renderBattleSetup(container);
    }));
    container.querySelector('#cl-battle-condition')?.addEventListener('input', e => state.battleSetup.condition = e.target.value);
    container.querySelector('#cl-battle-start')?.addEventListener('click', async () => {
        const { selected, condition } = state.battleSetup;
        if (selected.length < 2) return;
        showLoading(null, 'battle');
        try {
            const resultText = await runBattlePrompt(selected);
            const m = resultText.match(/【.{0,4}승자[：:]\s*(.+?)】/);
            const winner = m ? m[1].trim() : selected[0].name;
            hideLoading();
            const session = { id: 'battle_' + Date.now(), fighters: selected.map(f => f.name), condition, result: winner, resultText, createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.') };
            const s = getSettings(); s.battleList.unshift(session); save();
            state.activeBattleId = session.id; state.battleView = 'result'; renderActivePane();
        } catch (e) { hideLoading(); toastr.error(`배틀 실패: ${e.message}`); }
    });
}

function renderBattleResult(container) {
    const settings = getSettings();
    const session = settings.battleList.find(b => b.id === state.activeBattleId);
    if (!session) { state.battleView='list'; renderActivePane(); return; }
    const fighters = session.fighters.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);

    container.innerHTML = `
    <div style="background:${C.bgDeep};border-bottom:1px solid ${C.border};padding:10px 14px">
        <button id="cl-br-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;margin-bottom:8px;padding:0">◀ 목록</button>
        <div style="display:flex;align-items:center;gap:6px">
            ${fighters.slice(0,2).map((f,i) => `
            <div style="flex:1;display:flex;align-items:center;gap:8px;justify-content:${i===0?'flex-start':'flex-end'}">
                ${i===0?renderAvatar(f.name,f.gender,34):''}
                <div style="text-align:${i===0?'left':'right'}">
                    <div style="font-size:11px;font-weight:700;color:${C.textBright}">${esc(f.name)}</div>
                    <div style="font-size:10px;color:${C.textDim}">⚔️${f.stats.combat} 🗣️${f.stats.roast}</div>
                </div>
                ${i===1?renderAvatar(f.name,f.gender,34):''}
            </div>
            ${i===0?`<div style="font-weight:900;font-size:13px;color:${C.accent};padding:0 6px">VS</div>`:''}`).join('')}
        </div>
        ${session.condition?`<div style="margin-top:8px;font-size:10px;color:${C.textDim};padding:6px 8px;background:${C.bgCard};border-radius:2px">📍 ${esc(session.condition)}</div>`:''}
    </div>
    <div style="padding:14px">
        <div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:13px;min-height:140px;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap">${esc(session.resultText||'')}</div>
    </div>`;

    container.querySelector('#cl-br-back')?.addEventListener('click', () => { state.battleView='list'; renderActivePane(); });
}

// ═══════════════════════════════════════════
// 챗씨부인 — 궁합
// ═══════════════════════════════════════════
function renderMadameCompat(container) {
    const settings = getSettings();
    if (state.madameCompatView === 'result' && state.activeMadameId) { renderMadameResult(container); return; }
    if (state.madameCompatView === 'setup') { renderMadameSetup(container); return; }

    const recs = settings.madameList.map(m => `
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid ${C.purple};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px" class="cl-madame-rec" data-id="${m.id}">
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(m.cast.join(' ♥ '))}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${esc(m.compat?.type||'—')}${m.compat?.triangle?' · 🔺삼각':''}${m.compat?.poly?' · 💫폴리':''}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:22px;font-weight:900;color:${C.gold};font-family:monospace">${m.compat?.score||'?'}</div>
                <div style="font-size:9px;color:${C.textDim}">${esc(m.createdAt||'')}</div>
            </div>
            <button class="cl-madame-del" data-id="${m.id}" style="background:none;border:1px solid ${C.border};border-radius:2px;padding:3px 7px;cursor:pointer;color:${C.textDim};font-size:10px">🗑</button>
        </div>`).join('') || `<div style="text-align:center;color:${C.textDim};font-size:12px;padding:24px 0">점괘가 없구나...</div>`;

    container.innerHTML = `<div style="padding:14px">
        <div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:14px;text-align:center;margin-bottom:14px">
            <div style="font-size:9px;color:${C.textDim};letter-spacing:4px;margin-bottom:4px">◆◆◆◆◆◆◆</div>
            <div style="font-size:15px;font-weight:700;color:${C.gold}">챗씨부인운명상담소</div>
            <div style="font-size:10px;color:${C.textDim};margin-top:4px">그 남 그 녀의 인연의 실을 꿰어드립니다</div>
            <div style="font-size:9px;color:${C.textDim};letter-spacing:4px;margin-top:4px">◆◆◆◆◆◆◆</div>
        </div>
        ${renderDivider('궁합 기록', C.purple)}
        ${recs}
        <button id="cl-madame-new" style="width:100%;background:${C.purple}33;border:1px solid ${C.purple}88;border-radius:2px;padding:9px;cursor:pointer;color:${C.purple};font-size:12px;font-weight:700">🔮 새 궁합 보기</button>
    </div>`;

    container.querySelectorAll('.cl-madame-rec').forEach(rec => rec.addEventListener('click', () => {
        state.activeMadameId = rec.dataset.id; state.madameCompatView = 'result'; renderActivePane();
    }));
    container.querySelectorAll('.cl-madame-del').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const s = getSettings(); s.madameList = s.madameList.filter(m => m.id !== btn.dataset.id); save(); renderMadameCompat(container);
    }));
    container.querySelector('#cl-madame-new')?.addEventListener('click', () => { state.madameSetup={selected:[]}; state.madameCompatView='setup'; renderActivePane(); });
}

function renderMadameSetup(container) {
    const settings = getSettings();
    const { selected } = state.madameSetup;
    const allowSame = settings.allowSameGender !== false;

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${genderColor(g.id)};margin-bottom:6px;letter-spacing:2px">${g.label}</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-madame-sel" data-id="${char.id}" style="background:${inSel?C.purple+'22':C.bgCard};border:2px solid ${inSel?C.purple:C.border};border-radius:2px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 32)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel?C.textBright:C.text}">${esc(char.name)}</div><div style="font-size:10px;color:${C.textDim}">${esc(char.parsed?.job||'—')}</div></div>
                    ${inSel?`<div style="color:${C.purple}">♥</div>`:''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button id="cl-ms-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:700;color:${C.purple}">궁합 설정</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:11px 13px;margin-bottom:14px">
            <div><div style="font-size:12px;color:${C.textBright};font-weight:700">동성 커플 허용</div><div style="font-size:10px;color:${C.textDim};margin-top:2px">OFF시 동성은 관계 궁합으로 분석</div></div>
            <div id="cl-same-toggle" style="width:44px;height:24px;border-radius:12px;background:${allowSame?C.purple:'#2a1e12'};border:1px solid ${allowSame?C.purple:C.border};cursor:pointer;position:relative;transition:all.2s">
                <div style="position:absolute;top:2px;left:${allowSame?'22':'2'}px;width:18px;height:18px;background:${allowSame?'#fff':C.textDim};border-radius:50%;transition:left.2s"></div>
            </div>
        </div>
        ${renderDivider('캐스트 선택 (2명 이상)', C.purple)}
        ${charRows || `<div style="color:${C.textDim};font-size:12px;padding:12px 0">등록된 캐릭터 없음</div>`}
        ${selected.length >= 2 ? `
        <div style="background:${C.bgCard};border:1px solid ${C.purple}44;border-radius:2px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${selected.map((c,i) => `${i>0?`<span style="color:${C.purple}">♥</span>`:'' }${renderAvatar(c.name,c.gender,22)}<span style="font-size:11px;color:${C.textBright}">${esc(c.name)}</span>`).join('')}
            ${selected.length>=3?`<div style="font-size:10px;color:${C.purple};width:100%;margin-top:4px">▲ ${selected.length}명 — 삼각/다각 구도 분석</div>`:''}
        </div>` : ''}
        <button id="cl-madame-go" ${selected.length<2?'disabled':''} style="width:100%;background:${selected.length>=2?C.purple+'33':'#2a1e12'};border:1px solid ${selected.length>=2?C.purple:C.border};border-radius:2px;padding:9px;cursor:${selected.length>=2?'pointer':'not-allowed'};color:${selected.length>=2?C.purple:C.textDim};font-size:12px;font-weight:700">
            ${selected.length<2?`${Math.max(0,2-selected.length)}명 더 선택 필요`:`🔮 ${selected.length}명 궁합 보기`}
        </button>
    </div>`;

    container.querySelector('#cl-ms-back')?.addEventListener('click', () => { state.madameCompatView='list'; renderActivePane(); });
    container.querySelector('#cl-same-toggle')?.addEventListener('click', () => { const s=getSettings(); s.allowSameGender=!s.allowSameGender; save(); renderMadameSetup(container); });
    container.querySelectorAll('.cl-madame-sel').forEach(el => el.addEventListener('click', () => {
        const char = getSettings().roster.find(c => c.id === el.dataset.id);
        if (!char) return;
        const idx = state.madameSetup.selected.findIndex(c => c.id === el.dataset.id);
        if (idx >= 0) state.madameSetup.selected.splice(idx, 1); else state.madameSetup.selected.push(char);
        renderMadameSetup(container);
    }));
    container.querySelector('#cl-madame-go')?.addEventListener('click', async () => {
        const { selected } = state.madameSetup;
        if (selected.length < 2) return;
        toastr.clear();
        showLoading(null, 'compat');
        try {
            const compatText = await runCompatPrompt(selected, getSettings().allowSameGender);
            hideLoading();
            const scoreM = compatText.match(/총점[：:]\s*(\d+)/), typeM = compatText.match(/커플 유형[：:]\s*(.+)/);
            const score = scoreM ? parseInt(scoreM[1]) : Math.floor(50 + Math.random() * 50);
            const type = typeM ? typeM[1].trim() : '운명의 인연';
            const session = { id:'madame_'+Date.now(), cast:selected.map(c=>c.name), castIds:selected.map(c=>c.id), allowSame:getSettings().allowSameGender, createdAt:new Date().toLocaleDateString('ko').slice(2).replace(/\. /g,'.'), compat:{score,type,triangle:selected.length===3,poly:selected.length>3,resultText:compatText}, scenarios:null };
            const s = getSettings(); s.madameList.unshift(session); save();
            state.activeMadameId = session.id; state.madameCompatView = 'result'; renderActivePane();
        } catch (e) { hideLoading(); toastr.error(`궁합 분석 실패: ${e.message}`); }
    });
}

function renderMadameResult(container) {
    const settings = getSettings();
    const session = settings.madameList.find(m => m.id === state.activeMadameId);
    if (!session) { state.madameCompatView='list'; renderActivePane(); return; }
    const cast = session.castIds
        ? session.castIds.map(id => settings.roster.find(c => c.id === id)).filter(Boolean)
        : session.cast.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
    const compat = session.compat || {};
    const resultText = compat.resultText || '';

    function parseSection(text, icon) {
        const m = text.match(new RegExp(icon + '[^\\n]*\\n([\\s\\S]*?)(?=📊|💘|⚡|🎭|💑|🔺|🔥|🔞|$)', 'u'));
        return m ? m[1].trim() : '';
    }
    const scoreSection = parseSection(resultText, '📊');
    const dynamicSection = parseSection(resultText, '⚡');
    const genreSection = parseSection(resultText, '🎭');
    const deepSection = parseSection(resultText, '💑');
    const triSection = parseSection(resultText, '🔺');
    const sceneSection = parseSection(resultText, '🔥');
    const kinkSection = parseSection(resultText, '🔞');

    const scoreLines = scoreSection.split('\n').filter(l => l.trim() && (l.includes(':') || l.includes('：')));
    const scoreItems = scoreLines.map(line => {
        const m = line.match(/(.+?)[：:]\s*(\d+)/);
        if (!m) return '';
        const pct = Math.min(100, parseInt(m[2]));
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:80px;font-size:11px;color:${C.text};flex-shrink:0">${esc(m[1].trim())}</div>
            <div style="flex:1;height:6px;background:${C.bgDeep};border-radius:1px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${C.purple}"></div>
            </div>
            <div style="width:28px;font-size:12px;color:${C.purple};font-weight:900;font-family:monospace;text-align:right">${m[2]}</div>
        </div>`;
    }).join('');

    const scoreColor = compat.score >= 70 ? C.gold : compat.score >= 45 ? C.accent : '#a05050';

    container.innerHTML = `
    <div style="background:${C.bgDeep};border-bottom:1px solid ${C.border};padding:14px;text-align:center;position:relative">
        <button id="cl-mr-back" style="position:absolute;top:14px;left:14px;background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px">◀ 목록</button>
        <div style="font-size:10px;color:${C.textDim};letter-spacing:2px;margin-bottom:6px">✦ 운명의 실이 얽혀 있도다 ✦</div>
        <div style="display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap">
            ${cast.map((c,i) => `${i>0?`<span style="color:${C.purple}">♥</span>`:''}${renderAvatar(c.name,c.gender,28)}<span style="font-size:12px;color:${C.textBright};font-weight:700">${esc(c.name)}</span>`).join('')}
        </div>
        ${compat.triangle?`<div style="margin-top:6px;font-size:11px;color:${C.purple}">🔺 삼각관계의 기운이 감돌도다</div>`:compat.poly?`<div style="margin-top:6px;font-size:11px;color:${C.purple}">💫 다각의 인연이로다</div>`:''}
    </div>
    <div style="padding:14px">
        <div style="background:linear-gradient(180deg,#1a0030,#0f0020);border:2px solid #8800cc;border-radius:2px;padding:18px;text-align:center;margin-bottom:12px" class="cl-pulse-purple">
            <div style="font-size:10px;color:#664488;letter-spacing:2px;margin-bottom:8px;font-family:'Noto Serif KR',serif">이 인연의 점괘는...</div>
            <div style="font-size:54px;font-weight:900;color:${scoreColor};font-family:monospace;line-height:1;filter:drop-shadow(0 0 12px ${scoreColor}88)">${compat.score}</div>
            <div style="font-size:9px;color:${C.textDim};margin-top:4px">/ 100점</div>
            <div style="font-size:13px;font-weight:700;color:${C.textBright};margin-top:8px;font-family:'Noto Serif KR',serif">「${esc(compat.type)}」</div>
        </div>
        ${renderAccordion('📊','항목별 궁합 점수','각 기운의 수치를 보여드리리다', scoreItems || `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(scoreSection)}</div>`)}
        ${renderAccordion('⚡','관계의 기운','쫓는 자와 도망치는 자의 인연...', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(dynamicSection)}</div>`)}
        ${renderAccordion('🎭','예상 장르 TOP 3','이 인연에 가장 잘 어울리는 이야기...', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(genreSection)}</div>`)}
        ${renderAccordion('💑','궁합 심층 분석','잘 어울리는 점 · 충돌 · 장기 전망', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(deepSection)}</div>`)}
        ${compat.triangle||compat.poly ? renderAccordion('🔺','다각 구도 분석','키맨은 누구인가?', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(triSection)}</div>`) : ''}
        ${kinkSection ? renderAccordion('🔞','성향 궁합','킨크/성향의 궁합...', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(kinkSection)}</div>`) : ''}
        ${renderAccordion('🔥','터질 것 같은 명장면 TOP 3','반드시 일어날 씬들이 보이는도다', `<div style="padding-top:10px;font-size:12px;color:${C.text};line-height:2;white-space:pre-wrap">${esc(sceneSection)}</div>`)}
        <div style="margin-top:4px">
            ${renderDivider('롤플 시나리오 추천', C.purple)}
            <div id="cl-scenario-area">${session.scenarios ? renderScenarioCards(session.scenarios) : `<button id="cl-gen-scenarios" style="width:100%;background:${C.purple}22;border:1px solid ${C.purple}66;border-radius:2px;padding:9px;cursor:pointer;color:${C.purple};font-size:12px;font-weight:700">📖 시나리오 생성</button>`}</div>
        </div>
    </div>`;

    container.querySelector('#cl-mr-back')?.addEventListener('click', () => { state.madameCompatView='list'; renderActivePane(); });
    container.querySelectorAll('.cl-accordion-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    container.querySelector('#cl-gen-scenarios')?.addEventListener('click', async () => {
        container.querySelector('#cl-scenario-area').innerHTML = '';
        showLoading(null, 'scenario');
        try {
            const t = await runScenarioPrompt(cast, compat.resultText);
            hideLoading();
            session.scenarios = t; save();
            container.querySelector('#cl-scenario-area').innerHTML = renderScenarioCards(t);
            bindScenarioEvents(container);
        } catch (e) { hideLoading(); container.querySelector('#cl-scenario-area').innerHTML = `<div style="color:#a05050;font-size:12px">실패: ${esc(e.message)}</div>`; }
    });
    bindScenarioEvents(container);
}

function renderScenarioCards(text) {
    const blocks = text.split(/◆ 시나리오 \d+/).filter(b => b.trim());
    if (!blocks.length) return `<div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:13px;white-space:pre-wrap;font-size:12px;color:${C.text};line-height:1.9">${esc(text)}</div>`;
    return blocks.map((block, i) => {
        const gM = block.match(/장르[：:]\s*(.+)/), tM = block.match(/제목[：:]\s*"?(.+?)"?\n/);
        const genre = gM ? gM[1].trim() : `시나리오 ${i+1}`, title = tM ? tM[1].trim() : '';
        return `<div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:13px;margin-bottom:8px" data-idx="${i}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <div style="font-size:10px;color:${C.purple};letter-spacing:1px">◆ ${esc(genre)}</div>
                    <div style="font-size:13px;font-weight:700;color:${C.textBright};line-height:1.4;margin-top:4px">${esc(title)}</div>
                </div>
                <button class="cl-pin-btn" data-idx="${i}" style="background:none;border:1px solid ${C.border};border-radius:2px;padding:3px 8px;cursor:pointer;color:${C.textDim};font-size:10px;white-space:nowrap">📌 고정</button>
            </div>
            <div style="font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap;border-top:1px solid ${C.border};padding-top:10px">${esc(block.trim())}</div>
        </div>`;
    }).join('') + `<button id="cl-reroll-scenarios" style="width:100%;background:${C.purple}22;border:1px solid ${C.purple}66;border-radius:2px;padding:8px;cursor:pointer;color:${C.purple};font-size:11px;margin-top:4px">🔄 리롤</button>`;
}

function bindScenarioEvents(container) {
    container.querySelectorAll('.cl-pin-btn').forEach(btn => btn.addEventListener('click', () => {
        const isPinned = btn.closest('[data-idx]').classList.toggle('pinned');
        btn.textContent = isPinned ? '📌 고정됨' : '📌 고정';
        btn.style.color = isPinned ? C.purple : C.textDim;
        btn.style.borderColor = isPinned ? C.purple : C.border;
    }));
    container.querySelector('#cl-reroll-scenarios')?.addEventListener('click', async () => {
        const settings = getSettings(), session = settings.madameList.find(m => m.id === state.activeMadameId);
        if (!session) return;
        const cast = session.castIds ? session.castIds.map(id => settings.roster.find(c => c.id === id)).filter(Boolean) : session.cast.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
        const area = container.querySelector('#cl-scenario-area');
        area.innerHTML = `<div style="text-align:center;padding:20px;color:${C.textDim};font-size:12px">🔮 다시 엮는 중...</div>`;
        try {
            const t = await runScenarioPrompt(cast, session.compat?.resultText);
            session.scenarios = t; save(); area.innerHTML = renderScenarioCards(t); bindScenarioEvents(container);
        } catch (e) { area.innerHTML = `<div style="color:#a05050;font-size:12px">실패: ${esc(e.message)}</div>`; }
    });
}

// ═══════════════════════════════════════════
// 챗씨부인 — 시뮬
// ═══════════════════════════════════════════
function renderMadameSim(container) {
    const settings = getSettings();
    const { selected, situation } = state.simSetup;

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${genderColor(g.id)};margin-bottom:6px;letter-spacing:2px">${g.label}</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-sim-sel" data-id="${char.id}" style="background:${inSel?C.purple+'22':C.bgCard};border:2px solid ${inSel?C.purple:C.border};border-radius:2px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 28)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel?C.textBright:C.text}">${esc(char.name)}</div><div style="font-size:10px;color:${C.textDim}">${esc(char.parsed?.job||'—')}</div></div>
                    ${inSel?`<span style="color:${C.purple}">♥</span>`:''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        <div style="font-size:13px;font-weight:700;color:${C.purple};margin-bottom:12px">🎲 상황 시뮬레이터</div>
        <div style="font-size:11px;color:${C.textDim};line-height:1.7;margin-bottom:14px">캐릭터들을 선택하고 상황을 입력하면, 그 상황에서 어떻게 반응하고 전개될지 시뮬합니다.</div>
        ${renderDivider('참가자', C.purple)}
        ${charRows || `<div style="color:${C.textDim};font-size:12px;padding:10px 0">등록된 캐릭터 없음</div>`}
        ${renderDivider('상황', C.purple)}
        <textarea id="cl-sim-situation" rows="4" placeholder="예) 두 사람이 좁은 엘리베이터에 갇혔다.&#10;예) 회사 회식에서 마주쳤다." style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;resize:none;line-height:1.7;margin-bottom:12px">${esc(situation)}</textarea>
        ${selected.length>=1?`<div style="background:${C.bgCard};border:1px solid ${C.purple}44;border-radius:2px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${selected.map((c,i)=>`${i>0?`<span style="color:${C.purple};font-size:12px">+</span>`:''}${renderAvatar(c.name,c.gender,22)}<span style="font-size:11px;color:${C.textBright}">${esc(c.name)}</span>`).join('')}</div>`:''}
        <button id="cl-sim-go" ${selected.length<1?'disabled':''} style="width:100%;background:${selected.length>=1?C.purple+'33':'#2a1e12'};border:1px solid ${selected.length>=1?C.purple:C.border};border-radius:2px;padding:9px;cursor:${selected.length>=1?'pointer':'not-allowed'};color:${selected.length>=1?C.purple:C.textDim};font-size:12px;font-weight:700">${selected.length<1?'캐릭터를 선택하세요':'🎲 시뮬 시작'}</button>
        ${state.simResult?`<div style="margin-top:16px">
            ${renderDivider('시뮬 결과', C.purple)}
            <div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:13px;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap;max-height:400px;overflow-y:auto">${esc(state.simResult)}</div>
            <button id="cl-sim-reroll" style="width:100%;background:${C.purple}22;border:1px solid ${C.purple}66;border-radius:2px;padding:9px;cursor:pointer;color:${C.purple};font-size:12px;font-weight:700;margin-top:8px">🔄 다시 시뮬</button>
        </div>`:''}
    </div>`;

    container.querySelectorAll('.cl-sim-sel').forEach(el => el.addEventListener('click', () => {
        const char = getSettings().roster.find(c => c.id === el.dataset.id);
        if (!char) return;
        const idx = state.simSetup.selected.findIndex(c => c.id === el.dataset.id);
        if (idx >= 0) state.simSetup.selected.splice(idx, 1); else state.simSetup.selected.push(char);
        renderMadameSim(container);
    }));
    container.querySelector('#cl-sim-situation')?.addEventListener('input', e => state.simSetup.situation = e.target.value);
    async function doSim() {
        if (!state.simSetup.selected.length) return;
        showLoading(null, 'sim');
        try {
            const r = await runSimPrompt(state.simSetup.selected, state.simSetup.situation);
            hideLoading(); state.simResult = r; renderMadameSim(container);
        } catch (e) { hideLoading(); toastr.error(`시뮬 실패: ${e.message}`); renderMadameSim(container); }
    }
    container.querySelector('#cl-sim-go')?.addEventListener('click', doSim);
    container.querySelector('#cl-sim-reroll')?.addEventListener('click', doSim);
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// 챗씨부인 — 사주풀이
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
        { icon: '🔮', key: '사주팔자',      summary: '년주·월주·일주·시주' },
        { icon: '🌊', key: '오행의 기운',   summary: '지배하는 기운과 부족한 기운' },
        { icon: '⚡', key: '이 자의 본질',  summary: '캐릭터의 핵심과 롤플 포인트' },
        { icon: '🌟', key: '필요한 기운',   summary: '없으면 흔들리는 것' },
        { icon: '💼', key: '돈과 일의 기운',summary: '직업운과 재물운' },
        { icon: '💕', key: '인연의 기운',   summary: '연애운과 어울리는 상대' },
        { icon: '🏥', key: '몸의 기운',     summary: '건강운' },
        { icon: '📅', key: '지금 이 시기의 기운', summary: '현재 운세' },
        { icon: '✨', key: '챗씨부인의 한마디', summary: '롤플할 때 가장 중요한 포인트' },
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

// 설정 탭
// ═══════════════════════════════════════════
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

        ${renderDivider('저장 현황', C.accent)}
        <div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:14px;margin-bottom:14px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:12px">
                <div><div style="font-size:22px;font-weight:900;color:${C.female};font-family:monospace;text-shadow:0 0 8px ${C.female}88">${settings.roster.length}</div><div style="font-size:9px;color:${C.textDim}">캐릭터</div></div>
                <div><div style="font-size:22px;font-weight:900;color:#ff2200;font-family:monospace;text-shadow:0 0 8px #ff220088">${settings.battleList.length}</div><div style="font-size:9px;color:${C.textDim}">배틀</div></div>
                <div><div style="font-size:22px;font-weight:900;color:${C.purple};font-family:monospace;text-shadow:0 0 8px ${C.purple}88">${settings.madameList.length}</div><div style="font-size:9px;color:${C.textDim}">궁합</div></div>
                <div><div style="font-size:22px;font-weight:900;color:${C.gold};font-family:monospace;text-shadow:0 0 8px ${C.gold}88">${(settings.sajuList||[]).length}</div><div style="font-size:9px;color:${C.textDim}">사주</div></div>
            </div>
            <button id="cl-clear-all" style="width:100%;background:none;border:1px solid #550033;border-radius:2px;padding:8px;cursor:pointer;color:#aa4466;font-size:11px">🗑 전체 데이터 삭제</button>
        </div>

        <div style="text-align:center;font-size:9px;color:${C.textDim};padding-top:8px;border-top:1px solid ${C.border}">
            Scouter v2.0 · 챗씨부인운명상담소
        </div>
    </div>`;

    // 전체 삭제
    container.querySelector('#cl-clear-all')?.addEventListener('click', async () => {
        const { Popup, POPUP_RESULT } = SillyTavern.getContext();
        const confirmed = await Popup.show.confirm('전체 삭제', '모든 캐릭터, 배틀, 궁합, 사주 데이터를 삭제합니다. 복구 불가.');
        if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
            const s = getSettings(); s.roster=[]; s.battleList=[]; s.madameList=[]; s.sajuList=[]; save();
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
    #scouter-float {
        width: 100vw !important; height: 100dvh !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        border-radius: 0 !important; resize: none !important;
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
