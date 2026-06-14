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
    combat:   { label: '⚔️ 전투력',   color: '#c0824a' },
    roast:    { label: '🗣️ 말싸움',   color: '#b87333' },
    sex:      { label: '🔥 성적매력', color: '#a0522d' },
    mental:   { label: '🧠 정신력',   color: '#8b6914' },
    charisma: { label: '👑 카리스마', color: '#cd853f' },
};
const BATTLE_CATS = [
    { id: 'combat', label: '⚔️ 육탄전', color: '#c0824a' },
    { id: 'roast',  label: '🗣️ 말싸움', color: '#b87333' },
];
const GENDER_SECTIONS = [
    { id: 'female', label: '♀ 여성', color: '#c87070' },
    { id: 'male',   label: '♂ 남성', color: '#7090b8' },
];
const RANK_THRESHOLDS = [
    { min: 430, label: '신급 ★★★★★', color: '#d4a017' },
    { min: 380, label: '초인급 ★★★★', color: '#c0824a' },
    { min: 320, label: '엘리트 ★★★',  color: '#a0522d' },
    { min: 260, label: '강자 ★★',     color: '#7090b8' },
    { min: 0,   label: '범인 ★',      color: '#7a6a5a' },
];

// ═══════════════════════════════════════════
// 프롬프트 메타 & 기본 슬롯
// ═══════════════════════════════════════════
const PROMPT_META = {
    analyze:  { icon: '🔬', label: '캐릭터 분석',  desc: 'Parses character sheet into JSON stats+profile. Variables: {{name}} {{gender}} {{sheet}}' },
    combat:   { icon: '⚔️', label: '육탄전 배틀',  desc: 'Pokemon-style physical battle sim. Variables: {{fighters}} {{condition}}' },
    roast:    { icon: '🗣️', label: '말싸움 배틀',  desc: 'Pokemon-style verbal battle sim. Variables: {{fighters}} {{condition}}' },
    combatS:  { icon: '📊', label: '육탄전 분석',  desc: 'Serious analysis battle mode. Variables: {{fighters}} {{condition}}' },
    compat:   { icon: '💘', label: '궁합 분석',    desc: 'Compatibility analysis by 챗씨부인. Variables: {{castDesc}} {{genderNote}} {{structureNote}} {{multiLine}} {{triBlock}} {{sameGenderMode}}' },
    scenario: { icon: '📖', label: '롤플 시나리오',desc: 'Roleplay scenario generator. Variables: {{castDesc}} {{compatResult}}' },
    sim:      { icon: '🎲', label: '상황 시뮬',    desc: 'Situation simulator. Variables: {{castDesc}} {{situation}}' },
};

const DEFAULT_PROMPTS = {
    analyze: { active: 0, slots: [{ name: '기본',
        system: `You are a character analysis expert. Read the character sheet and return ONLY valid JSON, no markdown code blocks.
Gender detection rules — set "gender" to "male" if ANY of these appear: male pronouns (he/him/his), words like 남자/남성/그/아들/형/오빠/남편/아저씨/아버지/소년/청년, or explicit male anatomy references. Otherwise set "female".`,
        user: `Character name: {{name}}
Provided gender hint: {{gender}}

Character sheet:
{{sheet}}

Return ONLY this JSON (no other text):
{"age":"age or 불명","job":"job/role","location":"region/city","appearance":"appearance summary 1-2 sentences","personality":"personality summary 1-2 sentences","traits":"key traits/habits 1-2 sentences","kink":"sexual preferences, fetishes, turn-ons/turn-offs if mentioned — write 없음 if not specified","gender":"female or male — detect from sheet content, override the hint if sheet clearly indicates otherwise","stats":{"combat":integer 0-100,"roast":integer 0-100,"sex":integer 0-100,"mental":integer 0-100,"charisma":integer 0-100}}

Stats must be differentiated based on character traits. Avoid clustering all values similarly.` }] },

    combat: { active: 0, slots: [{ name: '포켓몬',
        system: `당신은 캐릭터 육탄전 배틀 내레이터입니다. 포켓몬 배틀 게임 특유의 짧고 임팩트 있는 텍스트 스타일로 씁니다. 각 캐릭터의 신체 능력과 전투 수치를 반영해서 현실감 있게 진행하세요. 마지막 줄에 반드시 【승자: 이름】 형식으로 끝내세요.`,
        user: `{{condition}}

참가자:
{{fighters}}

포켓몬 배틀 UI 스타일로 10~15행 내외. "캐릭터명이(가) 기술을 사용했다!", "급소에 맞았다!", "효과가 굉장하다!" 등 게임 텍스트 적극 사용. 캐릭터 성격 반영. 마지막 줄: 【승자: 이름】` }] },

    roast: { active: 0, slots: [{ name: '포켓몬',
        system: `당신은 캐릭터 말싸움 배틀 내레이터입니다. 포켓몬 배틀 게임 특유의 짧고 임팩트 있는 텍스트 스타일로 씁니다. 각 캐릭터의 성격과 언변 수치를 반영해서 현실감 있게 진행하세요. 마지막 줄에 반드시 【승자: 이름】 형식으로 끝내세요.`,
        user: `{{condition}}

참가자:
{{fighters}}

포켓몬 배틀 UI 스타일로 10~15행 내외. 캐릭터명: "대사" 형식. "급소에 맞았다!", "효과가 굉장하다!" 등 게임 텍스트 적극 사용. 캐릭터 성격/언변 수치 반영. 마지막 줄: 【승자: 이름】` }] },

    combatS: { active: 0, slots: [{ name: '시리어스',
        system: `You are a serious combat/conflict analyst. Analyze the given characters objectively and determine the likely outcome based on their stats, personality, and traits. Write in Korean. Be analytical and detailed.`,
        user: `Condition/context: {{condition}}

Participants:
{{fighters}}

Provide a serious analytical report in Korean:

⚔️ 【전력 분석】
각 캐릭터의 강점과 약점을 수치 기반으로 분석 (3-4문장씩)

🧮 【전황 시뮬레이션】
실제로 이 상황이 벌어진다면 어떻게 전개될지 단계별로 (5-7문장)

🏆 【결론: 승자 예측】
승자와 그 근거를 명확하게. 마지막 줄: 【최종 승자: 이름 (승률 XX%)】` }] },

    compat: { active: 0, slots: [{ name: '기본',
        system: `당신은 챗씨부인이라는 신묘한 점쟁이입니다. 사주와 관상으로 인연을 꿰뚫어보는 능력자. 말투는 한국 전통 점집 특유의 약간 신비롭고 능글맞은 사주 선생님 말투로. "~이로다", "~하느니라", "~하구나" 등의 어미 사용. 분석은 구체적이고 날카롭게. 좋은 궁합이든 최악의 궁합이든 있는 그대로 말하느니라.`,
        user: `다음 캐릭터들의 궁합을 분석하라.
{{genderNote}} / {{structureNote}}
{{sameGenderMode}}

캐릭터 정보:
{{castDesc}}

아래 항목을 순서대로 출력하라:

📊 【항목별 점수】
각 항목을 "항목명: 수치/100" 형식으로:
- 인연의 케미
- 긴장의 기운
- 충돌의 기운
- 감정 폭발력
- 정염의 기운{{multiLine}}

💘 【총 궁합 점수 & 한마디】
총점: XX점 / 100점
커플 유형: (유형명 — 점수가 낮으면 "최악의 앙숙", "절대 비호환", "재앙형 케미" 등 부정적 유형도 과감하게)
(점쟁이 말투로 한마디 2-3문장. 점수 30 이하면 독설, 50 이하면 냉정, 70 이상이면 긍정적으로)

⚡ 【관계의 기운】
(쫓는 자/도망치는 자, 감정선 주도권, 권력관계. 점쟁이 말투 4-6문장. 로맨스가 불가능하다면 그것도 직접적으로 말할 것)

🎭 【예상 장르 TOP 3】
1순위: 장르명 — 이유 (궁합이 나쁘면 비극, 앙숙물, 파국 등도 포함)
2순위: 장르명 — 이유
3순위: 장르명 — 이유

💑 【궁합 심층 분석】
잘 어울리는 점: (없으면 "없느니라" 또는 최소한의 공통점만)
충돌 포인트: (있는 그대로 날카롭게)
장기 전망: (비관적이면 비관적으로)

{{triBlock}}
🔥 【터질 것 같은 명장면 TOP 3】
(궁합이 나쁘면 싸움, 파국, 결별 씬도 포함)
1위: 제목 — 묘사 2문장
2위: 제목 — 묘사 2문장
3위: 제목 — 묘사 2문장

{{kinkSection}}` }] },

    scenario: { active: 0, slots: [{ name: '기본',
        system: `당신은 로맨스 소설 작가이자 롤플레이 시나리오 기획자입니다. 캐릭터 분석을 바탕으로 실제 롤플레이로 굴릴 수 있는 구체적인 시나리오를 씁니다.`,
        user: `다음 캐릭터들의 롤플레이 시나리오 3가지를 추천하라.

캐릭터:
{{castDesc}}

궁합 분석 참고:
{{compatResult}}

각 시나리오 형식:

◆ 시나리오 1
장르: (장르명)
제목: "(제목)"
첫 만남/시작: (어디서, 어떤 상황으로 시작. 3-4문장 구체적으로)
전개: (핵심 갈등/발전. 3-4문장)
추천 첫 장면: (롤플 시작 시 구체적인 첫 장면. 2-3문장)

◆ 시나리오 2
(같은 형식)

◆ 시나리오 3
(같은 형식)

장르 다양하게. 캐릭터 직업/나이/성격/지역 최대한 반영.` }] },

    sim: { active: 0, slots: [{ name: '기본',
        system: `당신은 롤플레이 시뮬레이터입니다. 주어진 상황에서 캐릭터들이 어떻게 반응하고 상황이 어떻게 전개될지 현실감 있게 시뮬레이션합니다. 캐릭터 성격을 충실히 반영하고, 대화와 행동을 섞어 소설체로 씁니다.`,
        user: `다음 캐릭터들이 주어진 상황에서 어떻게 행동하는지 시뮬레이션하라.

캐릭터:
{{castDesc}}

상황: {{situation}}

소설체로, 대화와 행동/심리 묘사 섞어서. 각 캐릭터 성격 확실히 드러나게. 300~500자 내외. 마지막에 【이 상황의 결과】 한 줄로 요약.` }] },
};

// ═══════════════════════════════════════════
// 기본 설정
// ═══════════════════════════════════════════
const defaultSettings = {
    roster: [], battleList: [], madameList: [],
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
    battleSetup: { selected: [], category: 'combat', condition: '' },
    madameSetup: { selected: [] },
    simSetup: { selected: [], situation: '' },
    simResult: null,
    battleMode: 'pokemon', // 'pokemon' | 'serious'
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
    const { generateRaw, extensionSettings } = SillyTavern.getContext();
    const settings = getSettings();
    const selectedProfileName = settings.selectedProfileName || null;
    let connectionProfile = null;
    if (selectedProfileName) {
        const profiles = extensionSettings?.['connectionManager']?.profiles || [];
        connectionProfile = profiles.find(p => p.name === selectedProfileName) || null;
    }
    const result = await generateRaw({
        systemPrompt: systemPrompt || undefined,
        prompt,
        ...(connectionProfile ? { connectionProfile } : {}),
    });
    return filterPhoneTrigger(result || '');
}

// ═══════════════════════════════════════════
// 프롬프트 실행
// ═══════════════════════════════════════════
async function analyzeCharSheet(name, gender, rawSheet) {
    const slot = getPromptSlot('analyze');
    const userPrompt = fillTpl(slot.user, { name, gender, sheet: rawSheet });
    try {
        const raw = await callAI(userPrompt, slot.system);
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        // 파싱된 성별 우선, 없으면 입력값 사용
        if (!parsed.gender) parsed.gender = gender;
        return parsed;
    } catch {
        return { age: '불명', job: '불명', location: '불명', appearance: '분석 실패', personality: '분석 실패', traits: '분석 실패', kink: '없음', gender, stats: { combat: 50, roast: 50, sex: 50, mental: 50, charisma: 50 } };
    }
}

async function runBattlePrompt(fighters, category, serious = false) {
    const key = serious ? 'combatS' : (category === 'roast' ? 'roast' : 'combat');
    const slot = getPromptSlot(key);
    const fightersText = fighters.map(f =>
        `【${f.name}】(${f.gender === 'female' ? '여' : '남'}, ${f.parsed.age}, ${f.parsed.job})\n성격: ${f.parsed.personality}\n특징: ${f.parsed.traits}\n${category === 'roast' ? '말싸움' : '전투력'} 수치: ${f.stats[category]}pt`
    ).join('\n\n');
    const { condition } = state.battleSetup;
    const condText = condition?.trim() ? `상황/조건: ${condition}` : '특별한 조건 없음.';
    return await callAI(fillTpl(slot.user, { fighters: fightersText, condition: condText }), slot.system);
}

async function runCompatPrompt(cast, allowSame) {
    const slot = getPromptSlot('compat');
    const castDesc = cast.map(c =>
        `【${c.name}】(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job}, ${c.parsed.location})\n성격: ${c.parsed.personality}\n특징: ${c.parsed.traits}\n외형: ${c.parsed.appearance}\n킨크/성향: ${c.parsed.kink || '없음'}`
    ).join('\n\n');
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
        kinkSection: cast.some(c => c.parsed?.kink && c.parsed.kink !== '없음')
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

// ═══════════════════════════════════════════
// HTML 헬퍼
// ═══════════════════════════════════════════
const C = {
    bg: '#1a1410', bgCard: '#221c16', bgDeep: '#0f0c08',
    border: '#3d2e20', borderLight: '#5a4030',
    text: '#c8aa88', textDim: '#7a6a55', textBright: '#e8d0a8',
    accent: '#c0824a', accentDim: '#8b5e35',
    female: '#c87070', male: '#7090b8',
    purple: '#9070b0', gold: '#d4a017',
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
        border:1px solid ${C.border};
        border-radius:4px;
        box-shadow:0 4px 24px rgba(0,0,0,0.6);
        z-index:9999;
        display:flex; flex-direction:column;
        resize:both; overflow:hidden;
        min-width:300px; min-height:360px;
        font-family: 'Noto Serif KR', 'Apple SD Gothic Neo', system-ui, sans-serif;
    ">
        <div id="scouter-drag-handle" style="
            background:${C.bgDeep};
            border-bottom:1px solid ${C.border};
            padding:8px 12px;
            display:flex; align-items:center; gap:10px;
            cursor:move; flex-shrink:0; user-select:none;
        ">
            <span style="font-size:16px">🔴</span>
            <div style="flex:1">
                <div style="font-weight:900;font-size:13px;letter-spacing:2px;font-family:monospace;color:${C.accent}">SCOUTER</div>
                <div style="font-size:9px;color:${C.textDim};letter-spacing:1px;font-family:monospace">챗씨부인운명상담소</div>
            </div>
            <button id="scouter-close" style="background:none;border:1px solid ${C.border};border-radius:3px;color:${C.textDim};cursor:pointer;font-size:12px;padding:2px 7px;font-family:monospace">✕</button>
        </div>
        <div id="cl-tabs" style="display:flex;background:${C.bgDeep};border-bottom:1px solid ${C.border};flex-shrink:0">
            <button class="cl-tab" data-tab="roster">👤 캐릭터</button>
            <button class="cl-tab" data-tab="battle">⚔️ 배틀</button>
            <button class="cl-tab" data-tab="madame">🔮 챗씨부인</button>
            <button class="cl-tab" data-tab="settings">⚙️ 설정</button>
        </div>
        <div id="cl-madame-subtabs" style="display:none;flex-shrink:0;background:${C.bgDeep};border-bottom:1px solid ${C.border}">
            <button class="cl-madame-subtab" data-subtab="compat">💘 궁합</button>
            <button class="cl-madame-subtab" data-subtab="sim">🎲 시뮬</button>
        </div>
        <div id="cl-content" style="flex:1;overflow-y:auto;overflow-x:hidden">
            <div class="cl-pane" id="cl-pane-roster"></div>
            <div class="cl-pane" id="cl-pane-battle"></div>
            <div class="cl-pane" id="cl-pane-madame-compat"></div>
            <div class="cl-pane" id="cl-pane-madame-sim"></div>
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
    document.querySelectorAll('#scouter-float .cl-tab').forEach(btn => {
        btn.style.color = btn.dataset.tab === tab ? C.accent : C.textDim;
        btn.style.borderBottom = btn.dataset.tab === tab ? `2px solid ${C.accent}` : '2px solid transparent';
        btn.style.fontWeight = btn.dataset.tab === tab ? '900' : '400';
    });
    const subtabs = document.getElementById('cl-madame-subtabs');
    if (subtabs) subtabs.style.display = tab === 'madame' ? 'flex' : 'none';
    renderActivePane();
}
function switchMadameSubtab(subtab) {
    state.currentMadameSubtab = subtab;
    document.querySelectorAll('#scouter-float .cl-madame-subtab').forEach(btn => {
        btn.style.color = btn.dataset.subtab === subtab ? C.purple : C.textDim;
        btn.style.borderBottom = btn.dataset.subtab === subtab ? `2px solid ${C.purple}` : '2px solid transparent';
        btn.style.fontWeight = btn.dataset.subtab === subtab ? '900' : '400';
    });
    renderActivePane();
}
function renderActivePane() {
    ['roster','battle','madame-compat','madame-sim','settings'].forEach(p => {
        const el = document.getElementById('cl-pane-' + p);
        if (el) el.className = 'cl-pane';
    });
    const tab = state.currentTab;
    if (tab === 'roster') { const el = document.getElementById('cl-pane-roster'); if (el) { el.className = 'cl-pane active'; renderRoster(el); } }
    else if (tab === 'battle') { const el = document.getElementById('cl-pane-battle'); if (el) { el.className = 'cl-pane active'; renderBattle(el); } }
    else if (tab === 'madame') {
        if (state.currentMadameSubtab === 'compat') { const el = document.getElementById('cl-pane-madame-compat'); if (el) { el.className = 'cl-pane active'; renderMadameCompat(el); } }
        else { const el = document.getElementById('cl-pane-madame-sim'); if (el) { el.className = 'cl-pane active'; renderMadameSim(el); } }
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
    const list = chars.map((c, i) => `<div class="cl-imp" data-idx="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid ${C.border};color:${C.text};font-size:12px">${esc(c.name)}</div>`).join('');
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(`<div style="max-height:300px;overflow-y:auto;background:${C.bgDeep}">${list}</div>`, POPUP_TYPE.TEXT, '', { okButton: '닫기' });
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
        const personas = power_user?.personas || {};
        const descriptions = power_user?.persona_descriptions || {};
        const entries = Object.entries(personas).filter(([, name]) => name && name !== '[Unnamed Persona]');
        if (!entries.length) { toastr.warning('등록된 페르소나가 없습니다'); return; }
        const list = entries.map(([file, name]) =>
            `<div class="cl-imp-p" data-file="${esc(file)}" data-name="${esc(name)}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid ${C.border};color:${C.text};font-size:12px;display:flex;align-items:center;gap:8px">👤 ${esc(name)}</div>`
        ).join('');
        const { Popup, POPUP_TYPE } = SillyTavern.getContext();
        const popup = new Popup(`<div style="max-height:300px;overflow-y:auto;background:${C.bgDeep}">${list}</div>`, POPUP_TYPE.TEXT, '', { okButton: '닫기' });
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

async function addCharFromImport(name, raw, gender) {
    const settings = getSettings();
    if (settings.roster.find(c => c.name === name)) { toastr.info(`${name}은 이미 등록됨`); return; }
    toastr.info(`${name} 분석 중...`);
    try {
        const parsed = await analyzeCharSheet(name, gender || 'female', raw);
        const detectedGender = parsed.gender || gender || 'female';
        settings.roster.push({
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            gender: detectedGender, name,
            parsed: { ...parsed, raw }, stats: parsed.stats,
        });
        save(); toastr.success(`${name} 등록 완료! (${detectedGender === 'female' ? '여성' : '남성'})`);
        if (state.rosterView === 'list') renderActivePane();
    } catch (e) { toastr.error(`${name} 분석 실패: ${e.message}`); }
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
        const profileHTML = [
            ['나이', char.parsed?.age], ['직업', char.parsed?.job], ['지역', char.parsed?.location],
            ['외형', char.parsed?.appearance], ['성격', char.parsed?.personality], ['특징', char.parsed?.traits],
            ['킨크/성향', char.parsed?.kink],
        ].map(([k, v]) =>
            `<div style="border-bottom:1px solid ${C.border};padding-bottom:10px;margin-bottom:10px">
                <div style="font-size:9px;color:${C.textDim};margin-bottom:4px;letter-spacing:2px">${k}</div>
                <div style="font-size:12px;color:${C.text};line-height:1.7">${esc(v || '—')}</div>
            </div>`
        ).join('');

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
        const cm = BATTLE_CATS.find(c => c.id === b.category) || BATTLE_CATS[0];
        return `<div style="background:${C.bgCard};border:1px solid ${C.border};border-left:3px solid ${cm.color};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px" class="cl-battle-card" data-id="${b.id}">
            <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${esc(b.fighters.join(' VS '))}</div>
                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${cm.label} · ${esc(b.condition||'조건 없음')}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:11px;color:${cm.color};font-weight:700">🏆 ${esc(b.result)}</div>
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
        state.activeBattleId = card.dataset.id; state.battleMode = 'pokemon'; state.battleView = 'result'; renderActivePane();
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
    const catMeta = BATTLE_CATS.find(c => c.id === category) || BATTLE_CATS[0];

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${genderColor(g.id)};margin-bottom:6px;letter-spacing:2px">${g.label}</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-sel-char" data-id="${char.id}" style="background:${inSel?catMeta.color+'22':C.bgCard};border:2px solid ${inSel?catMeta.color:C.border};border-radius:2px;padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:9px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 32)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel?C.textBright:C.text}">${esc(char.name)}</div><div style="font-size:10px;color:${C.textDim}">${esc(char.parsed?.job||'—')}</div></div>
                    <div style="font-size:15px;font-weight:900;color:${catMeta.color}">${char.stats[category]}</div>
                    ${inSel?`<div style="color:${catMeta.color}">✓</div>`:''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `<div style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button id="cl-battle-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;padding:0">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:700;color:${C.accent}">배틀 설정</span>
        </div>
        ${renderDivider('배틀 종류', C.accent)}
        <div style="display:flex;gap:8px;margin-bottom:16px">
            ${BATTLE_CATS.map(c => `<button class="cl-cat-btn" data-cat="${c.id}" style="flex:1;background:${category===c.id?c.color+'22':C.bgCard};border:2px solid ${category===c.id?c.color:C.border};border-radius:2px;padding:10px;cursor:pointer;color:${category===c.id?c.color:C.textDim};font-size:12px;font-weight:700">${c.label}</button>`).join('')}
        </div>
        ${renderDivider('파이터 선택 (2명 이상)', C.accent)}
        ${charRows || `<div style="color:${C.textDim};font-size:12px;padding:12px 0">등록된 캐릭터 없음</div>`}
        ${renderDivider('조건', C.accentDim)}
        <textarea id="cl-battle-condition" rows="3" placeholder="예) 삼각관계 폭로 현장에서&#10;비워두면 조건 없음" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:8px;color:${C.text};font-size:12px;box-sizing:border-box;outline:none;resize:none;line-height:1.7;margin-bottom:12px">${esc(condition)}</textarea>
        <button id="cl-battle-start" ${selected.length<2?'disabled':''} style="width:100%;background:${selected.length>=2?C.accent:'#2a1e12'};border:none;border-radius:2px;padding:9px;cursor:${selected.length>=2?'pointer':'not-allowed'};color:${selected.length>=2?'#fff':C.textDim};font-size:12px;font-weight:700">
            ${selected.length<2?`파이터 ${Math.max(0,2-selected.length)}명 더 필요`:`⚡ ${selected.length}명 배틀`}
        </button>
    </div>`;

    container.querySelector('#cl-battle-back')?.addEventListener('click', () => { state.battleView='list'; renderActivePane(); });
    container.querySelectorAll('.cl-cat-btn').forEach(btn => btn.addEventListener('click', () => { state.battleSetup.category=btn.dataset.cat; state.battleSetup.selected=[]; renderBattleSetup(container); }));
    container.querySelectorAll('.cl-sel-char').forEach(el => el.addEventListener('click', () => {
        const char = getSettings().roster.find(c => c.id === el.dataset.id);
        if (!char) return;
        const idx = state.battleSetup.selected.findIndex(c => c.id === el.dataset.id);
        if (idx >= 0) state.battleSetup.selected.splice(idx, 1); else state.battleSetup.selected.push(char);
        renderBattleSetup(container);
    }));
    container.querySelector('#cl-battle-condition')?.addEventListener('input', e => state.battleSetup.condition = e.target.value);
    container.querySelector('#cl-battle-start')?.addEventListener('click', async () => {
        const { selected, category, condition } = state.battleSetup;
        if (selected.length < 2) return;
        toastr.info('배틀 시뮬 중...');
        try {
            const resultText = await runBattlePrompt(selected, category, false);
            const m = resultText.match(/【승자[：:]\s*(.+?)】/);
            const winner = m ? m[1].trim() : selected[0].name;
            const seriousText = await runBattlePrompt(selected, category, true);
            const session = { id: 'battle_' + Date.now(), fighters: selected.map(f => f.name), category, condition, result: winner, resultText, seriousText, createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.') };
            const s = getSettings(); s.battleList.unshift(session); save();
            state.activeBattleId = session.id; state.battleMode = 'pokemon'; state.battleView = 'result'; renderActivePane();
        } catch (e) { toastr.error(`배틀 실패: ${e.message}`); }
    });
}

function renderBattleResult(container) {
    const settings = getSettings();
    const session = settings.battleList.find(b => b.id === state.activeBattleId);
    if (!session) { state.battleView='list'; renderActivePane(); return; }
    const fighters = session.fighters.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
    const catMeta = BATTLE_CATS.find(c => c.id === session.category) || BATTLE_CATS[0];
    const isPokemon = state.battleMode === 'pokemon';
    const text = isPokemon ? (session.resultText || '') : (session.seriousText || session.resultText || '');

    container.innerHTML = `<div style="background:${C.bgDeep};border-bottom:1px solid ${C.border};padding:10px 14px">
        <button id="cl-br-back" style="background:none;border:none;color:${C.textDim};cursor:pointer;font-size:11px;margin-bottom:8px;padding:0">◀ 목록</button>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
            ${fighters.slice(0,2).map((f,i) => `
            <div style="flex:1;display:flex;align-items:center;gap:8px;justify-content:${i===0?'flex-start':'flex-end'}">
                ${i===0?renderAvatar(f.name,f.gender,34):''}
                <div style="text-align:${i===0?'left':'right'}">
                    <div style="font-size:11px;font-weight:700;color:${C.textBright}">${esc(f.name)}</div>
                    <div style="font-size:12px;font-weight:900;color:${catMeta.color}">${f.stats[session.category]}pt</div>
                </div>
                ${i===1?renderAvatar(f.name,f.gender,34):''}
            </div>
            ${i===0?`<div style="font-weight:900;font-size:13px;color:${catMeta.color};padding:0 6px">VS</div>`:''}`).join('')}
        </div>
        <div style="display:flex;gap:8px">
            <button id="cl-mode-pokemon" style="flex:1;background:${isPokemon?catMeta.color+'33':'none'};border:1px solid ${isPokemon?catMeta.color:C.border};border-radius:2px;padding:6px;cursor:pointer;color:${isPokemon?catMeta.color:C.textDim};font-size:11px">🎮 포켓몬</button>
            <button id="cl-mode-serious" style="flex:1;background:${!isPokemon?C.gold+'33':'none'};border:1px solid ${!isPokemon?C.gold:C.border};border-radius:2px;padding:6px;cursor:pointer;color:${!isPokemon?C.gold:C.textDim};font-size:11px">📊 시리어스</button>
        </div>
    </div>
    <div style="padding:14px">
        <div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:13px;min-height:140px;font-size:12px;color:${C.text};line-height:1.9;white-space:pre-wrap;font-family:${isPokemon?'monospace':'inherit'}">${esc(text)}</div>
    </div>`;

    container.querySelector('#cl-br-back')?.addEventListener('click', () => { state.battleView='list'; renderActivePane(); });
    container.querySelector('#cl-mode-pokemon')?.addEventListener('click', () => { state.battleMode='pokemon'; renderBattleResult(container); });
    container.querySelector('#cl-mode-serious')?.addEventListener('click', () => { state.battleMode='serious'; renderBattleResult(container); });
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
        toastr.info('챗씨부인이 MINE신의 부름을 받아 달력을 봅니다...');
        try {
            const compatText = await runCompatPrompt(selected, getSettings().allowSameGender);
            const scoreM = compatText.match(/총점[：:]\s*(\d+)/), typeM = compatText.match(/커플 유형[：:]\s*(.+)/);
            const score = scoreM ? parseInt(scoreM[1]) : Math.floor(50 + Math.random() * 50);
            const type = typeM ? typeM[1].trim() : '운명의 인연';
            const session = { id:'madame_'+Date.now(), cast:selected.map(c=>c.name), castIds:selected.map(c=>c.id), allowSame:getSettings().allowSameGender, createdAt:new Date().toLocaleDateString('ko').slice(2).replace(/\. /g,'.'), compat:{score,type,triangle:selected.length===3,poly:selected.length>3,resultText:compatText}, scenarios:null };
            const s = getSettings(); s.madameList.unshift(session); save();
            state.activeMadameId = session.id; state.madameCompatView = 'result'; renderActivePane();
        } catch (e) { toastr.error(`궁합 분석 실패: ${e.message}`); }
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
        <div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:18px;text-align:center;margin-bottom:12px">
            <div style="font-size:10px;color:${C.textDim};letter-spacing:2px;margin-bottom:8px">이 인연의 점괘는...</div>
            <div style="font-size:54px;font-weight:900;color:${scoreColor};font-family:monospace;line-height:1">${compat.score}</div>
            <div style="font-size:9px;color:${C.textDim};margin-top:4px">/ 100점</div>
            <div style="font-size:13px;font-weight:700;color:${C.textBright};margin-top:8px">「${esc(compat.type)}」</div>
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
        container.querySelector('#cl-scenario-area').innerHTML = `<div style="text-align:center;padding:20px;color:${C.textDim};font-size:12px">🔮 시나리오를 엮는 중...</div>`;
        try {
            const t = await runScenarioPrompt(cast, compat.resultText);
            session.scenarios = t; save();
            container.querySelector('#cl-scenario-area').innerHTML = renderScenarioCards(t);
            bindScenarioEvents(container);
        } catch (e) { container.querySelector('#cl-scenario-area').innerHTML = `<div style="color:#a05050;font-size:12px">실패: ${esc(e.message)}</div>`; }
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
        toastr.info('시뮬 중...');
        try { const r = await runSimPrompt(state.simSetup.selected, state.simSetup.situation); state.simResult = r; renderMadameSim(container); }
        catch (e) { toastr.error(`시뮬 실패: ${e.message}`); renderMadameSim(container); }
    }
    container.querySelector('#cl-sim-go')?.addEventListener('click', doSim);
    container.querySelector('#cl-sim-reroll')?.addEventListener('click', doSim);
}

// ═══════════════════════════════════════════
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
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:12px">
                <div><div style="font-size:26px;font-weight:900;color:${C.female};font-family:monospace">${settings.roster.length}</div><div style="font-size:9px;color:${C.textDim}">캐릭터</div></div>
                <div><div style="font-size:26px;font-weight:900;color:${C.accent};font-family:monospace">${settings.battleList.length}</div><div style="font-size:9px;color:${C.textDim}">배틀</div></div>
                <div><div style="font-size:26px;font-weight:900;color:${C.purple};font-family:monospace">${settings.madameList.length}</div><div style="font-size:9px;color:${C.textDim}">궁합</div></div>
            </div>
            <button id="cl-clear-all" style="width:100%;background:none;border:1px solid #804040;border-radius:2px;padding:8px;cursor:pointer;color:#a06060;font-size:11px">🗑 전체 데이터 삭제</button>
        </div>

        ${renderDivider('개발자 모드', C.accent)}
        <div style="margin-bottom:14px">
            ${!devUnlocked ? `
            <div style="display:flex;gap:8px;align-items:center">
                <button id="cl-dev-btn" title="개발자 모드" style="background:${C.bgCard};border:1px solid ${C.border};border-radius:2px;padding:8px 12px;cursor:pointer;font-size:16px">🔒</button>
                <input id="cl-dev-pw" type="password" placeholder="비밀번호" style="flex:1;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:7px 10px;color:${C.text};font-size:12px;outline:none">
                <button id="cl-dev-unlock" style="background:${C.accent};border:none;border-radius:2px;padding:7px 12px;cursor:pointer;color:#fff;font-size:11px;font-weight:700">잠금해제</button>
            </div>` : `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
                <span style="font-size:16px">🔓</span>
                <span style="font-size:11px;color:${C.accent};font-weight:700">개발자 모드 활성화</span>
                <button id="cl-dev-lock" style="margin-left:auto;background:none;border:1px solid ${C.border};border-radius:2px;padding:4px 10px;cursor:pointer;color:${C.textDim};font-size:10px">잠금</button>
            </div>
            <div id="cl-prompt-editor">
                ${Object.entries(PROMPT_META).map(([key, meta]) => {
                    const def = DEFAULT_PROMPTS[key];
                    const p = settings.prompts?.[key] || def;
                    const activeIdx = p.active ?? 0;
                    const slot = p.slots?.[activeIdx] || def.slots[0];
                    return `<div style="background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;margin-bottom:8px;overflow:hidden">
                        <div class="cl-prompt-header" data-key="${key}" style="padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;background:${C.bgCard}">
                            <span>${meta.icon}</span>
                            <div style="flex:1">
                                <div style="font-size:12px;font-weight:700;color:${C.textBright}">${meta.label}</div>
                                <div style="font-size:10px;color:${C.textDim};margin-top:2px">${meta.desc}</div>
                            </div>
                            <span style="font-size:10px;color:${C.accent}">슬롯 ${activeIdx+1}</span>
                            <span style="color:${C.textDim}">▾</span>
                        </div>
                        <div class="cl-prompt-body" data-key="${key}" style="display:none;padding:12px">
                            <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
                                <span style="font-size:10px;color:${C.textDim}">슬롯:</span>
                                ${p.slots.map((s, i) => `<button class="cl-slot-btn" data-key="${key}" data-idx="${i}" style="padding:4px 10px;background:${i===activeIdx?C.accent+'33':'none'};border:1px solid ${i===activeIdx?C.accent:C.border};border-radius:2px;cursor:pointer;color:${i===activeIdx?C.accent:C.textDim};font-size:10px">${s.name||`슬롯${i+1}`}</button>`).join('')}
                                <button class="cl-slot-add" data-key="${key}" style="padding:4px 8px;background:none;border:1px dashed ${C.border};border-radius:2px;cursor:pointer;color:${C.textDim};font-size:10px">+ 추가</button>
                            </div>
                            <div style="margin-bottom:8px">
                                <div style="font-size:9px;color:${C.textDim};margin-bottom:4px;letter-spacing:1px">슬롯 이름</div>
                                <input class="cl-slot-name" data-key="${key}" value="${esc(slot?.name||`슬롯${activeIdx+1}`)}" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:6px 8px;color:${C.text};font-size:11px;outline:none;box-sizing:border-box">
                            </div>
                            <div style="margin-bottom:8px">
                                <div style="font-size:9px;color:${C.textDim};margin-bottom:4px;letter-spacing:1px">SYSTEM</div>
                                <textarea class="cl-slot-system" data-key="${key}" rows="3" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:6px 8px;color:${C.text};font-size:11px;outline:none;box-sizing:border-box;resize:vertical;line-height:1.6">${esc(slot?.system||'')}</textarea>
                            </div>
                            <div style="margin-bottom:8px">
                                <div style="font-size:9px;color:${C.textDim};margin-bottom:4px;letter-spacing:1px">USER ({{변수}} 사용 가능)</div>
                                <textarea class="cl-slot-user" data-key="${key}" rows="6" style="width:100%;background:${C.bgDeep};border:1px solid ${C.border};border-radius:2px;padding:6px 8px;color:${C.text};font-size:11px;outline:none;box-sizing:border-box;resize:vertical;line-height:1.6">${esc(slot?.user||'')}</textarea>
                            </div>
                            <div style="display:flex;gap:6px">
                                <button class="cl-slot-save" data-key="${key}" style="flex:1;background:${C.accent};border:none;border-radius:2px;padding:7px;cursor:pointer;color:#fff;font-size:11px;font-weight:700">💾 저장</button>
                                <button class="cl-slot-reset" data-key="${key}" style="padding:7px 10px;background:none;border:1px solid ${C.border};border-radius:2px;cursor:pointer;color:${C.textDim};font-size:10px">기본값</button>
                                ${p.slots.length > 1 ? `<button class="cl-slot-del" data-key="${key}" style="padding:7px 10px;background:none;border:1px solid ${C.border};border-radius:2px;cursor:pointer;color:${C.textDim};font-size:10px">🗑</button>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`}
        </div>

        <div style="text-align:center;font-size:9px;color:${C.textDim};padding-top:8px;border-top:1px solid ${C.border}">
            Scouter v2.0 · 챗씨부인운명상담소
        </div>
    </div>`;

    // 전체 삭제
    container.querySelector('#cl-clear-all')?.addEventListener('click', async () => {
        const { Popup, POPUP_RESULT } = SillyTavern.getContext();
        const confirmed = await Popup.show.confirm('전체 삭제', '모든 캐릭터, 배틀, 궁합 데이터를 삭제합니다. 복구 불가.');
        if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
            const s = getSettings(); s.roster=[]; s.battleList=[]; s.madameList=[]; save();
            toastr.success('전체 삭제 완료'); renderSettings(container);
        }
    });

    // 개발자 모드 잠금해제
    if (!devUnlocked) {
        const pwInput = container.querySelector('#cl-dev-pw');
        const unlock = () => {
            if (pwInput?.value === '8024') { const s=getSettings(); s.devUnlocked=true; save(); renderSettings(container); toastr.success('개발자 모드 활성화'); }
            else toastr.error('비밀번호 틀림');
        };
        container.querySelector('#cl-dev-unlock')?.addEventListener('click', unlock);
        pwInput?.addEventListener('keydown', e => { if (e.key==='Enter') unlock(); });
        container.querySelector('#cl-dev-btn')?.addEventListener('click', () => pwInput?.focus());
    } else {
        container.querySelector('#cl-dev-lock')?.addEventListener('click', () => { const s=getSettings(); s.devUnlocked=false; save(); renderSettings(container); });
        container.querySelectorAll('.cl-prompt-header').forEach(header => {
            header.addEventListener('click', () => {
                const body = container.querySelector(`.cl-prompt-body[data-key="${header.dataset.key}"]`);
                if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
            });
        });
        container.querySelectorAll('.cl-slot-btn').forEach(btn => btn.addEventListener('click', () => {
            const s=getSettings(); if(!s.prompts) s.prompts={};
            if(!s.prompts[btn.dataset.key]) s.prompts[btn.dataset.key]=structuredClone(DEFAULT_PROMPTS[btn.dataset.key]);
            s.prompts[btn.dataset.key].active=parseInt(btn.dataset.idx); save(); renderSettings(container);
        }));
        container.querySelectorAll('.cl-slot-add').forEach(btn => btn.addEventListener('click', () => {
            const s=getSettings(); if(!s.prompts) s.prompts={};
            if(!s.prompts[btn.dataset.key]) s.prompts[btn.dataset.key]=structuredClone(DEFAULT_PROMPTS[btn.dataset.key]);
            const def=DEFAULT_PROMPTS[btn.dataset.key].slots[0];
            s.prompts[btn.dataset.key].slots.push({name:`슬롯${s.prompts[btn.dataset.key].slots.length+1}`,system:def.system,user:def.user});
            s.prompts[btn.dataset.key].active=s.prompts[btn.dataset.key].slots.length-1; save(); renderSettings(container);
        }));
        container.querySelectorAll('.cl-slot-save').forEach(btn => btn.addEventListener('click', () => {
            const key=btn.dataset.key, s=getSettings();
            if(!s.prompts) s.prompts={};
            if(!s.prompts[key]) s.prompts[key]=structuredClone(DEFAULT_PROMPTS[key]);
            const idx=s.prompts[key].active??0;
            s.prompts[key].slots[idx]={
                name:container.querySelector(`.cl-slot-name[data-key="${key}"]`)?.value||`슬롯${idx+1}`,
                system:container.querySelector(`.cl-slot-system[data-key="${key}"]`)?.value||'',
                user:container.querySelector(`.cl-slot-user[data-key="${key}"]`)?.value||'',
            };
            save(); toastr.success(`${PROMPT_META[key]?.label} 저장됨`);
        }));
        container.querySelectorAll('.cl-slot-reset').forEach(btn => btn.addEventListener('click', () => {
            const key=btn.dataset.key, s=getSettings();
            if(!s.prompts) s.prompts={};
            if(!s.prompts[key]) s.prompts[key]=structuredClone(DEFAULT_PROMPTS[key]);
            const idx=s.prompts[key].active??0, def=DEFAULT_PROMPTS[key].slots[0];
            s.prompts[key].slots[idx]={...def, name:s.prompts[key].slots[idx]?.name||def.name};
            save(); renderSettings(container); toastr.success('기본값 복원');
        }));
        container.querySelectorAll('.cl-slot-del').forEach(btn => btn.addEventListener('click', () => {
            const key=btn.dataset.key, s=getSettings();
            if(!s.prompts?.[key]||s.prompts[key].slots.length<=1) return;
            const idx=s.prompts[key].active??0;
            s.prompts[key].slots.splice(idx,1);
            s.prompts[key].active=Math.max(0,idx-1); save(); renderSettings(container);
        }));
    }
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
.cl-accordion.open { border-color: ${C.borderLight}; }
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
@media (max-width: 480px) {
    #scouter-float { width: 100vw !important; height: 100vh !important; top: 0 !important; right: 0 !important; left: 0 !important; border-radius: 0; resize: none; }
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

    // 확장 탭 설정 UI
    const { extensionSettings } = SillyTavern.getContext();
    const profiles = extensionSettings?.['connectionManager']?.profiles || [];
    const savedProfile = getSettings().selectedProfileName || '';
    const profileOpts = profiles.map(p => `<option value="${esc(p.name)}" ${p.name===savedProfile?'selected':''}>${esc(p.name)}</option>`).join('');

    const settingsHtml = `<div class="inline-drawer">
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
    const extTarget = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    extTarget?.insertAdjacentHTML('beforeend', settingsHtml);
    document.getElementById('scouter-profile-select')?.addEventListener('change', e => {
        const s = getSettings(); s.selectedProfileName = e.target.value || null; save();
        toastr.success(e.target.value ? `"${e.target.value}" 선택됨` : '현재 연결 사용');
    });

    // extensionsMenu 버튼
    const scouterBtnHtml = `<div id="scouter-wand-btn" title="Scouter — 챗씨부인운명상담소" style="cursor:pointer;padding:4px 8px;display:flex;align-items:center;gap:5px;font-size:13px">
        <span>🔴</span><span style="font-size:12px">Scouter</span>
    </div>`;
    const toolbar = document.getElementById('extensionsMenu') ?? document.getElementById('top-bar');
    toolbar?.insertAdjacentHTML('beforeend', scouterBtnHtml);
    document.getElementById('scouter-wand-btn')?.addEventListener('click', toggleFloat);

    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.isPanelOpen) closeFloat(); });
    console.log(`[${MODULE_NAME}] 초기화 완료`);
}

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(event_types.APP_READY, async () => { await onActivate(); });
});
