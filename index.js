/**
 * CHARACTER LAB — 챗씨부인운명상담소
 * SillyTavern Extension v1.0.0
 */

const MODULE_NAME = 'character_lab';

// ═══════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════
const STAT_META = {
    combat:   { label: '⚔️ 전투력',   color: '#ff2200' },
    roast:    { label: '🗣️ 말싸움',   color: '#ff8800' },
    sex:      { label: '🔥 성적매력', color: '#ff1177' },
    mental:   { label: '🧠 정신력',   color: '#9900ff' },
    charisma: { label: '👑 카리스마', color: '#ffaa00' },
};
const BATTLE_CATS = [
    { id: 'combat', label: '⚔️ 육탄전', color: '#ff2200' },
    { id: 'roast',  label: '🗣️ 말싸움', color: '#ff8800' },
];
const GENDER_SECTIONS = [
    { id: 'female', label: '♀ 여성', color: '#ff44aa' },
    { id: 'male',   label: '♂ 남성', color: '#4488ff' },
];
const RANK_THRESHOLDS = [
    { min: 430, label: '신급 ★★★★★', color: '#fff700' },
    { min: 380, label: '초인급 ★★★★', color: '#ff8800' },
    { min: 320, label: '엘리트 ★★★',  color: '#ff2200' },
    { min: 260, label: '강자 ★★',     color: '#4488ff' },
    { min: 0,   label: '범인 ★',      color: '#664433' },
];
const defaultSettings = Object.freeze({
    roster: [], battleList: [], madameList: [],
    allowSameGender: true, selectedProfileName: null,
});

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
    battlePhase: 'ready',
    isPanelOpen: false,
};

// ═══════════════════════════════════════════
// 유틸
// ═══════════════════════════════════════════
function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(ctx.extensionSettings[MODULE_NAME], key)) {
            ctx.extensionSettings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
        }
    }
    return ctx.extensionSettings[MODULE_NAME];
}
function save() { SillyTavern.getContext().saveSettingsDebounced(); }
function getRank(t) { return RANK_THRESHOLDS.find(r => t >= r.min) || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1]; }
function getTotal(c) { return Object.values(c.stats || {}).reduce((a, b) => a + b, 0); }
function avatarHue(n) { return [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; }
function genderColor(g) { return g === 'female' ? '#ff44aa' : '#4488ff'; }
function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════
// AI 호출 — 선택된 연결 프로필 사용
// ═══════════════════════════════════════════
async function callAI(prompt, systemPrompt) {
    const { generateRaw, extensionSettings } = SillyTavern.getContext();
    const settings = getSettings();

    // 선택된 프로필 이름 가져오기
    const selectedProfileName = settings.selectedProfileName || null;

    // connection-manager 프로필 목록에서 해당 프로필 객체 찾기
    let connectionProfile = null;
    if (selectedProfileName) {
        const profiles = extensionSettings?.['connectionManager']?.profiles || [];
        connectionProfile = profiles.find(p => p.name === selectedProfileName) || null;
    }

    // generateRaw — connectionProfile 있으면 해당 프로필로, 없으면 현재 연결 그대로
    const result = await generateRaw({
        systemPrompt: systemPrompt || undefined,
        prompt,
        ...(connectionProfile ? { connectionProfile } : {}),
    });
    return result || '';
}

// ═══════════════════════════════════════════
// 프롬프트들
// ═══════════════════════════════════════════
async function analyzeCharSheet(name, gender, rawSheet) {
    const system = '당신은 캐릭터 분석 전문가입니다. 입력된 캐릭터 시트를 읽고 정확한 JSON을 반환하세요. 마크다운 코드블록 없이 순수 JSON만 반환하세요.';
    const prompt = `캐릭터 이름: ${name}
성별: ${gender === 'female' ? '여성' : '남성'}

캐릭터 시트:
${rawSheet}

반환 형식 (순수 JSON만):
{"age":"나이(없으면 불명)","job":"직업/역할","location":"거주지/활동지역","appearance":"외형 특징 요약 1-2문장","personality":"성격 특징 요약 1-2문장","traits":"주요 특성/습관/특이사항 1-2문장","stats":{"combat":0~100 정수,"roast":0~100 정수,"sex":0~100 정수,"mental":0~100 정수,"charisma":0~100 정수}}

수치는 캐릭터 설정에 충실하게, 차별화되게 책정하세요. 모든 수치가 비슷하면 안 됩니다.`;
    try {
        const raw = await callAI(prompt, system);
        return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
        return {
            age: '불명', job: '불명', location: '불명',
            appearance: '분석 실패', personality: '분석 실패', traits: '분석 실패',
            stats: { combat: 50, roast: 50, sex: 50, mental: 50, charisma: 50 }
        };
    }
}

async function runBattlePrompt(fighters, category, condition) {
    const catMeta = BATTLE_CATS.find(c => c.id === category) || BATTLE_CATS[0];
    const isRoast = category === 'roast';
    const desc = fighters.map(f =>
        `【${f.name}】(${f.gender === 'female' ? '여' : '남'}, ${f.parsed.age}, ${f.parsed.job}, ${f.parsed.location})
성격: ${f.parsed.personality}
특징: ${f.parsed.traits}
${catMeta.label} 수치: ${f.stats[category]}pt`
    ).join('\n\n');
    const cond = condition?.trim() ? `상황/조건: ${condition}` : '특별한 조건 없음. 그냥 붙어라.';
    const system = isRoast
        ? '당신은 캐릭터 말싸움 배틀 내레이터입니다. 포켓몬 배틀 게임 특유의 짧고 임팩트 있는 텍스트 스타일로 씁니다. 각 캐릭터의 성격과 언변 수치를 반영해서 현실감 있게 진행하세요. 마지막 줄에 반드시 【승자: 이름】 형식으로 끝내세요.'
        : '당신은 캐릭터 육탄전 배틀 내레이터입니다. 포켓몬 배틀 게임 특유의 짧고 임팩트 있는 텍스트 스타일로 씁니다. 각 캐릭터의 신체 능력과 전투 수치를 반영해서 현실감 있게 진행하세요. 마지막 줄에 반드시 【승자: 이름】 형식으로 끝내세요.';
    const prompt = `${cond}

참가자:
${desc}

위 캐릭터들을 ${catMeta.label} 카테고리로 싸움 붙여라.

출력 형식 (포켓몬 배틀 게임 UI 스타일):
- 각 행동/발언은 짧고 임팩트 있게
- "${isRoast ? `캐릭터명: "대사"` : '캐릭터명이(가) 기술을 사용했다!'}" 형식 활용
- "급소에 맞았다!" "효과가 굉장하다!" "야생의 X이(가) 나타났다!" 같은 포켓몬 게임 텍스트 적극 사용
- 캐릭터 성격이 배틀에 반영되어야 함
- 총 10~15행 내외
- 마지막 줄: 【승자: 이름】`;
    return await callAI(prompt, system);
}

async function runCompatPrompt(cast, allowSame) {
    const castDesc = cast.map(c =>
        `【${c.name}】(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job}, ${c.parsed.location})
성격: ${c.parsed.personality}
특징: ${c.parsed.traits}
외형: ${c.parsed.appearance}`
    ).join('\n\n');
    const isMulti = cast.length >= 3;
    const gNote = allowSame ? '동성 커플도 허용' : '이성 커플만 분석';
    const multiNote = isMulti ? '3명 이상이므로 삼각/다각 구도도 분석할 것' : '1:1 궁합 분석';
    const system = '당신은 마담뚜라는 신묘한 점쟁이입니다. 사주와 관상으로 인연을 꿰뚫어보는 능력자. 말투는 한국 전통 점집 특유의 약간 신비롭고 능글맞은 사주 선생님 말투로. "~이로다", "~하느니라", "~하구나" 등의 어미 사용. 하지만 분석 내용은 구체적이고 날카로워야 합니다.';
    const multiLine = isMulti ? '\n- 구도의 복잡함' : '';
    const triBlock = isMulti ? `\n🔺 【다각 구도 분석】\n(삼각/폴리 여부, 키맨은 누구인지, 구도 분석. 점쟁이 말투 4-6문장)\n` : '';
    const prompt = `다음 캐릭터들의 궁합을 분석하라.
${gNote} / ${multiNote}

캐릭터 정보:
${castDesc}

아래 항목을 순서대로 출력하라. 각 항목 앞에 아이콘과 제목을 붙여라:

📊 【항목별 점수】
각 항목을 "항목명: 수치/100" 형식으로, 한 줄씩:
- 인연의 케미
- 긴장의 기운
- 충돌의 기운
- 감정 폭발력
- 정염의 기운${multiLine}

💘 【총 궁합 점수 & 한마디】
총점: XX점 / 100점
커플 유형: (유형명)
(점쟁이 말투로 한마디, 2-3문장)

⚡ 【관계의 기운】
(누가 쫓는 자고 누가 도망치는 자인지, 감정선 주도권, 권력 관계 등. 점쟁이 말투로 4-6문장)

🎭 【예상 장르 TOP 3】
1순위: 장르명 — 이유 한 문장
2순위: 장르명 — 이유 한 문장
3순위: 장르명 — 이유 한 문장

💑 【궁합 심층 분석】
잘 어울리는 점: (구체적으로 2-3문장)
충돌 포인트: (구체적으로 2-3문장)
장기 전망: (구체적으로 2-3문장)
${triBlock}
🔥 【터질 것 같은 명장면 TOP 3】
1위: 제목 — 묘사 2문장
2위: 제목 — 묘사 2문장
3위: 제목 — 묘사 2문장`;
    return await callAI(prompt, system);
}

async function runScenarioPrompt(cast, compatResult) {
    const castDesc = cast.map(c =>
        `${c.name}(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job}, ${c.parsed.location}): ${c.parsed.personality} / ${c.parsed.traits}`
    ).join('\n');
    const system = '당신은 로맨스 소설 작가이자 롤플레이 시나리오 기획자입니다. 캐릭터 분석을 바탕으로 실제 롤플레이로 굴릴 수 있는 구체적인 시나리오를 씁니다.';
    const prompt = `다음 캐릭터들의 롤플레이 시나리오 3가지를 추천하라.

캐릭터:
${castDesc}

궁합 분석 참고:
${(compatResult || '').slice(0, 600)}

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

장르 다양하게 (다크로맨스, 로맨코미, 슬로우번, 에너미즈투러버스, 계약연애, 재회물, 직장로맨스 등). 캐릭터 직업/나이/성격/지역 최대한 반영.`;
    return await callAI(prompt, system);
}

async function runSimPrompt(cast, situation) {
    const castDesc = cast.map(c =>
        `【${c.name}】(${c.gender === 'female' ? '여' : '남'}, ${c.parsed.age}, ${c.parsed.job})
성격: ${c.parsed.personality}
특징: ${c.parsed.traits}`
    ).join('\n\n');
    const system = '당신은 롤플레이 시뮬레이터입니다. 주어진 상황에서 캐릭터들이 어떻게 반응하고 상황이 어떻게 전개될지 현실감 있게 시뮬레이션합니다. 캐릭터 성격을 충실히 반영하고, 대화와 행동을 섞어 소설체로 씁니다.';
    const prompt = `다음 캐릭터들이 주어진 상황에서 어떻게 행동하는지 시뮬레이션하라.

캐릭터:
${castDesc}

상황: ${situation || '두 사람이 우연히 마주쳤다.'}

소설체로, 대화와 행동/심리 묘사 섞어서. 각 캐릭터 성격 확실히 드러나게. 300~500자 내외. 마지막에 【이 상황의 결과】 한 줄로 요약.`;
    return await callAI(prompt, system);
}

// ═══════════════════════════════════════════
// HTML 헬퍼
// ═══════════════════════════════════════════
function renderAvatar(name, gender, size = 44) {
    const hue = avatarHue(name);
    const gc = genderColor(gender);
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 35% 35%,hsl(${hue},60%,28%),hsl(${hue},40%,10%));border:2px solid ${gc};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.33)}px;font-weight:900;color:hsl(${hue},90%,75%);flex-shrink:0;font-family:monospace;box-shadow:0 0 10px ${gc}66">${initials}</div>`;
}

function renderMiniStats(stats) {
    return `<div style="width:72px">${Object.entries(stats).map(([s, v]) =>
        `<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
        <span style="font-size:8px;width:12px;color:${STAT_META[s].color}">${STAT_META[s].label.split(' ')[0]}</span>
        <div style="flex:1;height:3px;background:#1a0010;border-radius:1px;overflow:hidden">
        <div style="width:${v}%;height:100%;background:${STAT_META[s].color}"></div></div></div>`
    ).join('')}</div>`;
}

function renderTotalPow(total) {
    const rank = getRank(total);
    return `<div style="text-align:right;min-width:44px">
        <div style="font-size:18px;font-weight:900;color:${rank.color};font-family:monospace;text-shadow:0 0 8px ${rank.color}">${total}</div>
        <div style="font-size:9px;color:${rank.color}">${rank.label}</div>
    </div>`;
}

function renderDivider(label, color) {
    return `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 10px">
        <div style="flex:1;height:1px;background:linear-gradient(90deg,${color}88,transparent)"></div>
        <span style="font-size:9px;font-weight:700;letter-spacing:2px;color:${color};font-family:monospace;text-shadow:0 0 6px ${color}">◆ ${esc(label)} ◆</span>
        <div style="flex:1;height:1px;background:linear-gradient(270deg,${color}88,transparent)"></div>
    </div>`;
}

function renderAccordion(icon, title, summary, bodyHTML) {
    const id = 'acc_' + Math.random().toString(36).slice(2);
    return `<div class="cl-accordion" id="${id}">
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
// 패널 HTML
// ═══════════════════════════════════════════
function createPanelHTML() {
    return `<div id="character-lab-panel">
    <div id="cl-header">
        <div id="cl-header-top">
            <span id="cl-logo">🔴</span>
            <div id="cl-title-wrap">
                <div id="cl-title" class="cl-shimmer">CHARACTER LAB</div>
                <div id="cl-subtitle">POWER SCANNER · BATTLE · 챗씨부인운명상담소</div>
            </div>
            <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
                <span class="cl-blink" style="color:#ff2200;font-size:8px">●</span>
                <span class="cl-blink" style="color:#ffaa00;font-size:8px;animation-delay:.3s">●</span>
                <span class="cl-blink" style="color:#cc44ff;font-size:8px;animation-delay:.6s">●</span>
                <button id="cl-close">✕</button>
            </div>
        </div>
        <div id="cl-tabs">
            <button class="cl-tab" data-tab="roster">👤 캐릭터</button>
            <button class="cl-tab" data-tab="battle">⚔️ 배틀</button>
            <button class="cl-tab" data-tab="madame">🔮 마담뚜</button>
            <button class="cl-tab" data-tab="settings">⚙️ 설정</button>
        </div>
        <div id="cl-madame-subtabs">
            <button class="cl-madame-subtab" data-subtab="compat">💘 궁합</button>
            <button class="cl-madame-subtab" data-subtab="sim">🎲 시뮬</button>
        </div>
    </div>
    <div id="cl-content">
        <div class="cl-pane" id="cl-pane-roster"></div>
        <div class="cl-pane" id="cl-pane-battle"></div>
        <div class="cl-pane" id="cl-pane-madame-compat"></div>
        <div class="cl-pane" id="cl-pane-madame-sim"></div>
        <div class="cl-pane" id="cl-pane-settings"></div>
    </div>
</div>`;
}

// ═══════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════
function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.cl-tab').forEach(btn => {
        btn.className = 'cl-tab';
        if (btn.dataset.tab === tab) btn.classList.add('active-' + tab);
    });
    const subtabs = document.getElementById('cl-madame-subtabs');
    if (subtabs) subtabs.className = tab === 'madame' ? 'visible' : '';
    renderActivePane();
}

function switchMadameSubtab(subtab) {
    state.currentMadameSubtab = subtab;
    document.querySelectorAll('.cl-madame-subtab').forEach(btn => {
        btn.className = 'cl-madame-subtab';
        if (btn.dataset.subtab === subtab) btn.classList.add('active');
    });
    renderActivePane();
}

function renderActivePane() {
    ['roster', 'battle', 'madame-compat', 'madame-sim', 'settings'].forEach(p => {
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
// 기본설정 탭
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
            const rank = getRank(total);
            return `<div class="cl-char-card ${char.gender}" data-id="${char.id}">
                ${renderAvatar(char.name, char.gender, 46)}
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:900;color:#ffcc88;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(char.name)}</div>
                    <div style="font-size:10px;color:#664433;margin-top:2px">${esc(char.parsed?.job || '—')} · ${esc(char.parsed?.location || '—')}</div>
                </div>
                ${renderMiniStats(char.stats)}
                ${renderTotalPow(total)}
            </div>`;
        }).join('');
        return renderDivider(g.label, g.color) + cards;
    }).join('');

    container.innerHTML = (settings.roster.length ? sections : `<div style="text-align:center;color:#440022;font-size:13px;padding:24px 0;font-family:monospace">등록된 캐릭터 없음</div>`)
        + `<button class="cl-btn cl-btn-md cl-btn-pink" id="cl-add-btn" style="margin-bottom:8px">＋ 캐릭터 등록</button>
           <div style="display:flex;gap:8px">
               <button id="cl-import-chars" style="flex:1;background:none;border:1px dashed #220011;border-radius:2px;padding:7px;cursor:pointer;color:#440033;font-size:10px;font-family:monospace">ST 캐릭터 불러오기</button>
               <button id="cl-import-persona" style="flex:1;background:none;border:1px dashed #220011;border-radius:2px;padding:7px;cursor:pointer;color:#440033;font-size:10px;font-family:monospace">페르소나 불러오기</button>
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
    const list = chars.map((c, i) => `<div class="cl-imp" data-idx="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #220011;color:#cc9977;font-family:monospace;font-size:12px">${esc(c.name)}</div>`).join('');
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(`<div style="max-height:300px;overflow-y:auto;background:#0f0010;border:1px solid #440033;border-radius:2px">${list}</div>`, POPUP_TYPE.TEXT, '', { okButton: '닫기' });
    setTimeout(() => {
        document.querySelectorAll('.cl-imp').forEach(item => item.addEventListener('click', () => {
            const c = chars[parseInt(item.dataset.idx)];
            const raw = [c.description, c.personality, c.scenario, c.first_mes].filter(Boolean).join('\n\n');
            addCharFromImport(c.name, raw, 'female');
            popup.hide?.();
        }));
    }, 100);
    popup.show();
}

function importPersonas() {
    const dropdown = document.getElementById('persona-management-dropdown');
    if (!dropdown) { toastr.warning('페르소나 드롭다운을 찾을 수 없습니다'); return; }

    const options = Array.from(dropdown.options).filter(o => o.value && o.value !== '');
    if (!options.length) { toastr.warning('등록된 페르소나가 없습니다'); return; }

    const list = options.map(o =>
        `<div class="cl-imp-p" data-name="${esc(o.textContent.trim())}" data-value="${esc(o.value)}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #220011;color:#cc9977;font-family:monospace;font-size:12px">${esc(o.textContent.trim())}</div>`
    ).join('');

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(
        `<div style="max-height:300px;overflow-y:auto;background:#0f0010;border:1px solid #440033;border-radius:2px">${list}</div>`,
        POPUP_TYPE.TEXT, '', { okButton: '닫기' }
    );
    setTimeout(() => {
        document.querySelectorAll('.cl-imp-p').forEach(item => item.addEventListener('click', async () => {
            const name = item.dataset.name;
            const value = item.dataset.value;

            // dropdown 선택 변경 후 change 이벤트 발생 → ST가 persona_description 업데이트
            const prevValue = dropdown.value;
            dropdown.value = value;
            dropdown.dispatchEvent(new Event('change', { bubbles: true }));

            // ST가 description 업데이트할 시간 대기
            await new Promise(r => setTimeout(r, 300));

            const desc = document.getElementById('persona_description')?.value || '';
            const raw = `페르소나 이름: ${name}\n${desc || '(설명 없음)'}`;

            // 원래 선택으로 복구
            dropdown.value = prevValue;
            dropdown.dispatchEvent(new Event('change', { bubbles: true }));

            addCharFromImport(name, raw, 'female');
            popup.hide?.();
        }));
    }, 100);
    popup.show();
}

async function addCharFromImport(name, raw, gender) {
    const settings = getSettings();
    if (settings.roster.find(c => c.name === name)) { toastr.info(`${name}은 이미 등록됨`); return; }
    toastr.info(`${name} 분석 중...`);
    try {
        const parsed = await analyzeCharSheet(name, gender || 'female', raw);
        settings.roster.push({
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            gender: gender || 'female', name,
            parsed: { ...parsed, raw }, stats: parsed.stats,
        });
        save();
        toastr.success(`${name} 등록 완료!`);
        if (state.rosterView === 'list') renderActivePane();
    } catch (e) { toastr.error(`${name} 분석 실패: ${e.message}`); }
}

function renderAddChar(container) {
    container.innerHTML = `
        <button style="background:none;border:none;color:#664433;cursor:pointer;font-size:11px;margin-bottom:12px;padding:0;font-family:monospace" id="cl-add-back">◀ 뒤로</button>
        <div style="font-size:14px;font-weight:900;color:#ffaa00;letter-spacing:2px;font-family:monospace;margin-bottom:16px">◆ 캐릭터 등록 ◆</div>
        <label class="cl-label">성별</label>
        <div style="display:flex;gap:8px;margin-bottom:14px">
            ${GENDER_SECTIONS.map(g => `<button class="cl-gender-btn" data-gender="${g.id}" style="flex:1;background:#0f0010;border:2px solid #330022;border-radius:2px;padding:8px;cursor:pointer;color:#440033;font-weight:900;font-size:12px;font-family:monospace">${g.label}</button>`).join('')}
        </div>
        <label class="cl-label">이름</label>
        <input class="cl-input" id="cl-add-name" placeholder="캐릭터 이름" style="margin-bottom:14px">
        <label class="cl-label">캐릭터 시트 (복붙)</label>
        <textarea class="cl-input cl-textarea" id="cl-add-raw" rows="7" placeholder="ST 카드, 고급정의, 페르소나 시트 등 전부 붙여넣기&#10;나이·직업·외형·성격·지역 등 상세할수록 분석 품질↑"></textarea>
        <div style="font-size:10px;color:#664433;margin:6px 0 16px;font-family:monospace">※ AI가 시트 읽고 항목 자동 파싱 + 능력치 산출</div>
        <div style="display:flex;gap:8px">
            <button class="cl-btn cl-btn-md" id="cl-add-cancel" style="border:2px solid #440033;color:#664433;background:transparent">취소</button>
            <button class="cl-btn cl-btn-md cl-btn-red" id="cl-add-submit">분석 시작 ▶</button>
        </div>`;

    let selectedGender = 'female';
    const btns = container.querySelectorAll('.cl-gender-btn');
    function selGender(g) {
        selectedGender = g;
        btns.forEach(btn => {
            const gc = GENDER_SECTIONS.find(s => s.id === btn.dataset.gender);
            btn.style.background = btn.dataset.gender === g ? gc.color + '22' : '#0f0010';
            btn.style.borderColor = btn.dataset.gender === g ? gc.color : '#330022';
            btn.style.color = btn.dataset.gender === g ? gc.color : '#440033';
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
                    <span style="color:#cc9977;font-family:monospace">${STAT_META[s].label}</span>
                    <span style="color:${STAT_META[s].color};font-weight:900;font-family:monospace;text-shadow:0 0 6px ${STAT_META[s].color}">${v}</span>
                </div>
                <div style="height:6px;background:#1a0010;border:1px solid #330022;border-radius:1px;overflow:hidden">
                    <div style="width:${v}%;height:100%;background:linear-gradient(90deg,${STAT_META[s].color}55,${STAT_META[s].color});box-shadow:0 0 8px ${STAT_META[s].color}"></div>
                </div>
            </div>`).join('');
        const sorted = Object.entries(char.stats).sort((a, b) => b[1] - a[1]);
        const maxS = sorted[0], minS = sorted[sorted.length - 1];
        const profileHTML = [['나이', char.parsed?.age], ['직업', char.parsed?.job], ['지역', char.parsed?.location], ['외형', char.parsed?.appearance], ['성격', char.parsed?.personality], ['특징', char.parsed?.traits]].map(([k, v]) =>
            `<div style="border-bottom:1px solid #220011;padding-bottom:10px;margin-bottom:10px"><div style="font-size:9px;color:#664433;margin-bottom:4px;font-family:monospace;letter-spacing:2px">${k}</div><div style="font-size:12px;color:#cc9977;line-height:1.7">${esc(v || '—')}</div></div>`
        ).join('');
        const tabContent = subTab === 'stats'
            ? statHTML + `<div style="display:flex;gap:10px;margin-top:14px;background:linear-gradient(135deg,#1a0520,#0f0118);border:1px solid #551166;border-radius:2px;padding:12px">
                <div style="flex:1;text-align:center"><div style="font-size:9px;color:#664433;font-family:monospace">MAX</div><div style="font-size:11px;font-weight:700;color:#ff2200;margin-top:3px">${STAT_META[maxS[0]].label}</div><div style="font-size:20px;font-weight:900;color:#ff2200;font-family:monospace">${maxS[1]}</div></div>
                <div style="width:1px;background:#330055"></div>
                <div style="flex:1;text-align:center"><div style="font-size:9px;color:#664433;font-family:monospace">MIN</div><div style="font-size:11px;font-weight:700;color:#4488ff;margin-top:3px">${STAT_META[minS[0]].label}</div><div style="font-size:20px;font-weight:900;color:#4488ff;font-family:monospace">${minS[1]}</div></div>
              </div>`
            : subTab === 'profile' ? profileHTML
            : `<div style="font-size:9px;color:#664433;margin-bottom:8px;font-family:monospace;letter-spacing:2px">원본 시트</div><div style="background:#0f0010;border:1px solid #330022;border-radius:2px;padding:12px;font-size:11px;color:#775544;line-height:1.8;white-space:pre-wrap;word-break:break-word">${esc(char.parsed?.raw || '—')}</div>`;

        container.innerHTML = `
        <div style="background:linear-gradient(160deg,${gc}22,#0a0010);border-bottom:2px solid ${gc}66;padding:14px 14px 10px;position:relative;overflow:hidden">
            <div style="position:absolute;inset:0;opacity:.04;background-image:repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 20px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 20px)"></div>
            <button style="background:none;border:none;color:#664433;cursor:pointer;font-size:11px;margin-bottom:10px;padding:0;font-family:monospace;position:relative" id="cl-detail-back">◀ 목록으로</button>
            <div style="display:flex;gap:14px;align-items:center;position:relative">
                <div style="position:relative">${renderAvatar(char.name, char.gender, 64)}<div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-size:14px;filter:drop-shadow(0 0 4px ${gc})">${char.gender === 'female' ? '♀' : '♂'}</div></div>
                <div style="flex:1">
                    <div style="font-size:8px;padding:2px 8px;border-radius:2px;background:${gc}22;border:1px solid ${gc}88;color:${gc};font-weight:700;letter-spacing:1px;font-family:monospace;display:inline-block;margin-bottom:4px">${char.gender === 'female' ? '♀ 여성' : '♂ 남성'}</div>
                    <div style="font-size:19px;font-weight:900;color:#fff;font-family:monospace">${esc(char.name)}</div>
                    <div style="font-size:11px;color:#664433;margin-top:3px">${esc(char.parsed?.age || '—')}세 · ${esc(char.parsed?.job || '—')} · ${esc(char.parsed?.location || '—')}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:10px;color:#664433;font-family:monospace;margin-bottom:2px">TOTAL</div>
                    <div style="font-size:30px;font-weight:900;font-family:monospace;background:linear-gradient(90deg,#ff4444,#ff9900,#ff66aa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">${total}</div>
                    <div style="font-size:10px;color:${rank.color};margin-top:3px;font-weight:700;text-shadow:0 0 6px ${rank.color}">${rank.label}</div>
                </div>
            </div>
        </div>
        <div style="display:flex;background:#0a0010;border-bottom:1px solid #330022">
            ${['stats', 'profile', 'raw'].map(id => `<button class="cl-subtab" data-subtab="${id}" style="flex:1;background:none;border:none;border-bottom:3px solid ${subTab === id ? gc : 'transparent'};padding:9px 0;cursor:pointer;color:${subTab === id ? gc : '#443322'};font-size:11px;font-family:monospace;font-weight:${subTab === id ? '900' : '400'}">${id === 'stats' ? '능력치' : id === 'profile' ? '프로필' : '원본'}</button>`).join('')}
        </div>
        <div style="padding:14px;background:#0a0010">${tabContent}</div>
        <div style="padding:10px 14px;border-top:1px solid #330022;background:#0a0010;display:flex;gap:8px">
            <button id="cl-detail-delete" style="border:2px solid #440022;color:#664433;background:transparent;font-family:monospace;font-size:11px;padding:5px 12px;border-radius:2px;cursor:pointer">🗑 삭제</button>
            <button id="cl-detail-close" style="border:2px solid #330022;color:#554433;background:transparent;font-family:monospace;font-size:11px;padding:5px 12px;border-radius:2px;cursor:pointer">◀ 닫기</button>
        </div>`;

        container.querySelector('#cl-detail-back')?.addEventListener('click', () => { state.rosterView = 'list'; renderActivePane(); });
        container.querySelector('#cl-detail-close')?.addEventListener('click', () => { state.rosterView = 'list'; renderActivePane(); });
        container.querySelectorAll('.cl-subtab').forEach(btn => btn.addEventListener('click', () => { subTab = btn.dataset.subtab; doRender(); }));
        container.querySelector('#cl-detail-delete')?.addEventListener('click', async () => {
            const { Popup, POPUP_RESULT } = SillyTavern.getContext();
            const confirmed = await Popup.show.confirm('삭제 확인', `${char.name}을(를) 삭제하시겠습니까?`);
            if (confirmed === POPUP_RESULT.AFFIRMATIVE) {
                const s = getSettings(); s.roster = s.roster.filter(c => c.id !== char.id); save();
                state.rosterView = 'list'; renderActivePane(); toastr.success(`${char.name} 삭제 완료`);
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
        return `<div class="cl-battle-card" data-id="${b.id}">
            <div style="flex:1"><div style="font-size:12px;font-weight:900;color:#ffcc88;font-family:monospace">${esc(b.fighters.join(' VS '))}</div><div style="font-size:10px;color:#553322;margin-top:2px">${cm.label} · ${esc(b.condition || '조건 없음')}</div></div>
            <div style="text-align:right"><div style="font-size:11px;color:${cm.color};font-weight:900;font-family:monospace;text-shadow:0 0 6px ${cm.color}">🏆 ${esc(b.result)}</div><div style="font-size:9px;color:#443322">${esc(b.createdAt)}</div></div>
        </div>`;
    }).join('') || `<div style="text-align:center;color:#330022;font-size:12px;padding:20px 0;font-family:monospace">기록 없음</div>`;

    container.innerHTML = renderDivider('배틀 기록', '#ff2200') + cards + `<button class="cl-btn cl-btn-md cl-btn-red" id="cl-battle-new">⚔ 새 배틀 만들기</button>`;
    container.querySelectorAll('.cl-battle-card').forEach(card => card.addEventListener('click', () => { state.activeBattleId = card.dataset.id; state.battlePhase = 'ready'; state.battleView = 'result'; renderActivePane(); }));
    container.querySelector('#cl-battle-new')?.addEventListener('click', () => { state.battleSetup = { selected: [], category: 'combat', condition: '' }; state.battleView = 'setup'; renderActivePane(); });
}

function renderBattleSetup(container) {
    const settings = getSettings();
    const { selected, category, condition } = state.battleSetup;
    const catMeta = BATTLE_CATS.find(c => c.id === category) || BATTLE_CATS[0];

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:12px">
            <div style="font-size:9px;color:${g.color};margin-bottom:6px;letter-spacing:2px;font-family:monospace">— ${g.label} —</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-sel-char" data-id="${char.id}" style="background:${inSel ? `linear-gradient(135deg,${catMeta.color}22,${catMeta.color}11)` : '#0a0005'};border:2px solid ${inSel ? catMeta.color : g.color + '33'};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px;box-shadow:${inSel ? `0 0 10px ${catMeta.color}44` : 'none'}">
                    ${renderAvatar(char.name, char.gender, 34)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:900;color:${inSel ? '#ffffcc' : '#cc9966'};font-family:monospace">${esc(char.name)}</div><div style="font-size:10px;color:#553322">${esc(char.parsed?.job || '—')}</div></div>
                    <div style="font-size:16px;font-weight:900;color:${catMeta.color};font-family:monospace;text-shadow:0 0 6px ${catMeta.color}">${char.stats[category]}</div>
                    ${inSel ? `<div style="color:${catMeta.color};font-size:14px;text-shadow:0 0 6px ${catMeta.color}">✓</div>` : ''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button style="background:none;border:none;color:#664433;cursor:pointer;font-size:11px;padding:0;font-family:monospace" id="cl-battle-back">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:900;color:#ff8800;font-family:monospace;letter-spacing:1px;text-shadow:0 0 6px #ff880088">배틀 설정</span>
        </div>
        ${renderDivider('배틀 종류', '#ff2200')}
        <div style="display:flex;gap:8px;margin-bottom:16px">
            ${BATTLE_CATS.map(c => `<button class="cl-cat-btn" data-cat="${c.id}" style="flex:1;background:${category === c.id ? `linear-gradient(180deg,${c.color}44,${c.color}22)` : '#0a0005'};border:2px solid ${category === c.id ? c.color : '#220011'};border-radius:2px;padding:10px;cursor:pointer;color:${category === c.id ? c.color : '#440022'};font-size:12px;font-weight:900;font-family:monospace;box-shadow:${category === c.id ? `0 0 12px ${c.color}66` : 'none'}">${c.label}</button>`).join('')}
        </div>
        ${renderDivider('파이터 선택 (2명 이상)', '#ff2200')}
        ${charRows || `<div style="color:#440022;font-size:12px;font-family:monospace;padding:12px 0">등록된 캐릭터 없음</div>`}
        ${renderDivider('싸움 조건', '#ff8800')}
        <textarea class="cl-input cl-textarea" id="cl-battle-condition" rows="3" placeholder="예) 삼각관계 폭로 현장에서 마주침&#10;예) 좁은 엘리베이터 안&#10;비워두면 그냥 붙어라" style="margin-bottom:12px">${esc(condition)}</textarea>
        ${selected.length >= 2 ? `<div style="background:linear-gradient(135deg,#110005,#0a0003);border:1px solid ${catMeta.color}44;border-radius:2px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${selected.map((f, i) => `${i > 0 ? `<span style="color:${catMeta.color};font-weight:900;font-family:monospace;text-shadow:0 0 6px ${catMeta.color}">VS</span>` : ''}${renderAvatar(f.name, f.gender, 22)}<span style="font-size:11px;color:#cc9966;font-family:monospace">${esc(f.name)}</span>`).join('')}</div>` : ''}
        <button class="cl-btn cl-btn-md ${selected.length >= 2 ? 'cl-btn-red' : ''}" id="cl-battle-start" style="${selected.length < 2 ? 'background:#111;border:2px solid #220011;color:#330022' : ''}" ${selected.length < 2 ? 'disabled' : ''}>
            ${selected.length < 2 ? `파이터 ${Math.max(0, 2 - selected.length)}명 더 필요` : `⚡ ${selected.length}명 배틀 시작`}
        </button>`;

    container.querySelector('#cl-battle-back')?.addEventListener('click', () => { state.battleView = 'list'; renderActivePane(); });
    container.querySelectorAll('.cl-cat-btn').forEach(btn => btn.addEventListener('click', () => { state.battleSetup.category = btn.dataset.cat; state.battleSetup.selected = []; renderBattleSetup(container); }));
    container.querySelectorAll('.cl-sel-char').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.id, char = getSettings().roster.find(c => c.id === id);
        if (!char) return;
        const idx = state.battleSetup.selected.findIndex(c => c.id === id);
        if (idx >= 0) state.battleSetup.selected.splice(idx, 1); else state.battleSetup.selected.push(char);
        renderBattleSetup(container);
    }));
    container.querySelector('#cl-battle-condition')?.addEventListener('input', e => state.battleSetup.condition = e.target.value);
    container.querySelector('#cl-battle-start')?.addEventListener('click', async () => {
        const { selected, category, condition } = state.battleSetup;
        if (selected.length < 2) return;
        toastr.info('배틀 시뮬 중...');
        try {
            const resultText = await runBattlePrompt(selected, category, condition);
            const m = resultText.match(/【승자[：:]\s*(.+?)】/);
            const winner = m ? m[1].trim() : selected[0].name;
            const session = { id: 'battle_' + Date.now(), fighters: selected.map(f => f.name), category, condition, result: winner, resultText, createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.') };
            const s = getSettings(); s.battleList.unshift(session); save();
            state.activeBattleId = session.id; state.battlePhase = 'ready'; state.battleView = 'result'; renderActivePane();
        } catch (e) { toastr.error(`배틀 실패: ${e.message}`); }
    });
}

function renderBattleResult(container) {
    const settings = getSettings();
    const session = settings.battleList.find(b => b.id === state.activeBattleId);
    if (!session) { state.battleView = 'list'; renderActivePane(); return; }
    const fighters = session.fighters.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
    const catMeta = BATTLE_CATS.find(c => c.id === session.category) || BATTLE_CATS[0];
    const lines = (session.resultText || '').split('\n').filter(l => l.trim());

    function getDisplayLines(phase) {
        if (phase === 'ready') return [`📍 ${session.condition || '조건 없음'}`, `야생의 ${session.fighters.slice(1).join(', ')}이(가) 나타났다!`, `${session.fighters[0]}은(는) 어떻게 할까?`];
        if (phase === 'fight') return lines.slice(0, Math.ceil(lines.length * 0.75));
        return lines;
    }

    function doRender() {
        const phase = state.battlePhase;
        const logHTML = getDisplayLines(phase).map(line => {
            const isWin = line.includes('【승자') || line.includes('승리!');
            const isDown = line.includes('쓰러졌다') || line.includes('패배');
            const isDialog = line.includes(': "');
            return `<p class="cl-log-line${isWin ? ' win' : isDown ? ' down' : isDialog ? ' dialog' : ''}"${isDialog ? ` style="border-left-color:${catMeta.color}"` : ''}>${esc(line)}</p>`;
        }).join('');

        container.innerHTML = `
        <div style="background:linear-gradient(180deg,#1a0500,#050008);border-bottom:2px solid ${catMeta.color}66;padding:10px 13px">
            <button style="background:none;border:none;color:#664433;cursor:pointer;font-size:11px;margin-bottom:8px;padding:0;font-family:monospace" id="cl-br-back">◀ 배틀 목록</button>
            <div style="display:flex;align-items:center;gap:6px">
                ${fighters.slice(0, 2).map((f, i) => `
                <div style="flex:1"><div style="display:flex;align-items:center;gap:8px;justify-content:${i === 0 ? 'flex-start' : 'flex-end'}">
                    ${i === 0 ? renderAvatar(f.name, f.gender, 36) : ''}
                    <div style="text-align:${i === 0 ? 'left' : 'right'}"><div style="font-size:11px;font-weight:900;color:#ffcc88;font-family:monospace">${esc(f.name)}</div><div style="font-size:12px;font-weight:900;color:${catMeta.color};font-family:monospace;text-shadow:0 0 6px ${catMeta.color}">${f.stats[session.category]}pt</div></div>
                    ${i === 1 ? renderAvatar(f.name, f.gender, 36) : ''}
                </div></div>
                ${i === 0 ? `<div style="font-weight:900;font-size:14px;color:${catMeta.color};padding:0 6px;font-family:monospace;text-shadow:0 0 10px ${catMeta.color}">VS</div>` : ''}`).join('')}
            </div>
            <div style="margin-top:10px;display:flex;gap:6px;align-items:center">
                <div style="flex:1"><div style="font-size:8px;color:#664433;margin-bottom:2px;font-family:monospace">HP</div><div class="cl-hp-bar-wrap"><div class="cl-hp-bar" style="width:${phase === 'result' ? '15' : '100'}%;background:linear-gradient(90deg,#ff2200,#ff8800)"></div></div></div>
                <div style="flex:1"><div style="font-size:8px;color:#664433;margin-bottom:2px;font-family:monospace;text-align:right">HP</div><div class="cl-hp-bar-wrap"><div class="cl-hp-bar" style="width:${phase === 'result' ? '84' : '100'}%;background:linear-gradient(90deg,#0044ff88,#4488ff);margin-left:auto"></div></div></div>
            </div>
        </div>
        <div style="padding:13px;background:#050008">
            <div class="cl-battle-log-box" style="border-color:${catMeta.color}66">
                <div class="cl-scanline"></div>
                ${logHTML}
                ${phase !== 'result' ? `<span class="cl-blink" style="color:${catMeta.color};font-size:12px">▼</span>` : ''}
            </div>
            <div class="cl-battle-btn-grid">
                <button class="cl-battle-btn go" id="cl-phase-fight" ${phase !== 'ready' ? 'disabled' : ''}>${phase === 'fight' ? '진행 중...' : phase === 'result' ? '—' : '▶ 싸움 시작'}</button>
                <button class="cl-battle-btn end" id="cl-phase-result" ${phase !== 'fight' ? 'disabled' : ''}>${phase === 'result' ? '결판 완료' : '⚡ 결판'}</button>
                ${phase === 'result' ? '<button class="cl-battle-btn retry" id="cl-phase-retry">🔄 처음부터</button><button class="cl-battle-btn back" id="cl-phase-back">◀ 목록</button>' : ''}
            </div>
        </div>`;

        container.querySelector('#cl-br-back')?.addEventListener('click', () => { state.battleView = 'list'; renderActivePane(); });
        container.querySelector('#cl-phase-fight')?.addEventListener('click', () => { state.battlePhase = 'fight'; doRender(); });
        container.querySelector('#cl-phase-result')?.addEventListener('click', () => { state.battlePhase = 'result'; doRender(); });
        container.querySelector('#cl-phase-retry')?.addEventListener('click', () => { state.battlePhase = 'ready'; doRender(); });
        container.querySelector('#cl-phase-back')?.addEventListener('click', () => { state.battleView = 'list'; renderActivePane(); });
    }
    doRender();
}

// ═══════════════════════════════════════════
// 마담뚜 — 궁합
// ═══════════════════════════════════════════
function renderMadameCompat(container) {
    const settings = getSettings();
    if (state.madameCompatView === 'result' && state.activeMadameId) { renderMadameResult(container); return; }
    if (state.madameCompatView === 'setup') { renderMadameSetup(container); return; }

    const recs = settings.madameList.map(m => `
        <div class="cl-madame-rec" data-id="${m.id}">
            <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#ffccaa;font-family:'Noto Serif KR',serif">${esc(m.cast.join(' ♥ '))}</div><div style="font-size:10px;color:#664455;margin-top:2px">${esc(m.compat?.type || '—')}${m.compat?.triangle ? ' · 🔺삼각' : ''}${m.compat?.poly ? ' · 💫폴리' : ''}</div></div>
            <div style="text-align:right"><div style="font-size:24px;font-weight:900;color:#ffaa00;font-family:monospace;text-shadow:0 0 8px #ffaa0088;line-height:1">${m.compat?.score || '?'}</div><div style="font-size:9px;color:#664455">${esc(m.createdAt || '')}</div></div>
        </div>`).join('') || `<div style="text-align:center;color:#441155;font-size:12px;padding:24px 0;font-family:'Noto Serif KR',serif">점괘가 없구나...</div>`;

    container.innerHTML = `
        <div class="cl-madame-header cl-pulse-gold">
            <div style="font-size:9px;color:#664488;letter-spacing:4px;font-family:monospace;margin-bottom:4px">◆◆◆◆◆◆◆◆◆</div>
            <div class="cl-madame-signboard-title">챗씨부인운명상담소</div>
            <div class="cl-madame-signboard-sub">그 남 그 녀의 인연의 실을 꿰어드립니다</div>
            <div style="font-size:9px;color:#664488;letter-spacing:4px;font-family:monospace;margin-top:4px">◆◆◆◆◆◆◆◆◆</div>
        </div>
        ${renderDivider('궁합 기록', '#cc44ff')}
        ${recs}
        <button class="cl-btn cl-btn-md cl-btn-purple" id="cl-madame-new">🔮 새 궁합 보기</button>`;

    container.querySelectorAll('.cl-madame-rec').forEach(rec => rec.addEventListener('click', () => { state.activeMadameId = rec.dataset.id; state.madameCompatView = 'result'; renderActivePane(); }));
    container.querySelector('#cl-madame-new')?.addEventListener('click', () => { state.madameSetup = { selected: [] }; state.madameCompatView = 'setup'; renderActivePane(); });
}

function renderMadameSetup(container) {
    const settings = getSettings();
    const { selected } = state.madameSetup;
    const allowSame = settings.allowSameGender !== false;

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:12px">
            <div style="font-size:9px;color:${g.color};margin-bottom:6px;letter-spacing:2px;font-family:monospace">— ${g.label} —</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-madame-sel" data-id="${char.id}" style="background:${inSel ? 'linear-gradient(135deg,#2a0040,#1a0030)' : '#0f0018'};border:2px solid ${inSel ? '#cc44ff' : g.color + '33'};border-radius:2px;padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:6px;box-shadow:${inSel ? '0 0 10px #cc44ff44' : 'none'}">
                    ${renderAvatar(char.name, char.gender, 34)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel ? '#ffccaa' : '#cc9966'};font-family:'Noto Serif KR',serif">${esc(char.name)}</div><div style="font-size:10px;color:#664455">${esc(char.parsed?.age !== '—' ? char.parsed?.age + '세 · ' : '')}${esc(char.parsed?.job || '—')} · ${esc(char.parsed?.location || '—')}</div></div>
                    ${inSel ? '<div style="color:#cc44ff;font-size:18px;text-shadow:0 0 8px #cc44ff">♥</div>' : ''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <button style="background:none;border:none;color:#664455;cursor:pointer;font-size:11px;padding:0;font-family:monospace" id="cl-ms-back">◀ 뒤로</button>
            <span style="font-size:13px;font-weight:900;color:#cc44ff;font-family:monospace;letter-spacing:1px;text-shadow:0 0 6px #cc44ff88">궁합 설정</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#1a0030,#0f0018);border:1px solid #551166;border-radius:2px;padding:11px 13px;margin-bottom:14px">
            <div><div style="font-size:12px;color:#ffccaa;font-weight:700;font-family:'Noto Serif KR',serif">동성 커플 허용</div><div style="font-size:10px;color:#664455;margin-top:2px">동성 궁합 및 성향 분석 포함</div></div>
            <div id="cl-same-toggle" style="width:48px;height:26px;border-radius:2px;background:${allowSame ? 'linear-gradient(90deg,#cc44ff88,#cc44ff)' : '#1a0010'};border:2px solid ${allowSame ? '#cc44ff' : '#330022'};cursor:pointer;position:relative;transition:all.2s;box-shadow:${allowSame ? '0 0 8px #cc44ff88' : 'none'}"><div style="position:absolute;top:2px;left:${allowSame ? '24' : '2'}px;width:18px;height:18px;background:${allowSame ? '#fff' : '#440033'};transition:left.2s;border-radius:1px"></div></div>
        </div>
        ${renderDivider('캐스트 선택 (2명 이상, 제한 없음)', '#cc44ff')}
        ${charRows || `<div style="color:#441155;font-size:12px;font-family:monospace;padding:12px 0">등록된 캐릭터 없음</div>`}
        ${selected.length >= 2 ? `
        <div style="background:linear-gradient(135deg,#1a0030,#0f0018);border:1px solid #551166;border-radius:2px;padding:10px 12px;margin-bottom:12px">
            <div style="font-size:9px;color:#664455;margin-bottom:6px;font-family:'Noto Serif KR',serif">선택된 인연</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${selected.map((c, i) => `${i > 0 ? '<span style="color:#cc44ff;font-size:14px;text-shadow:0 0 6px #cc44ff">♥</span>' : ''}${renderAvatar(c.name, c.gender, 22)}<span style="font-size:11px;color:#ffccaa;font-family:\'Noto Serif KR\',serif">${esc(c.name)}</span>`).join('')}</div>
            ${selected.length >= 3 ? `<div style="margin-top:6px;font-size:10px;color:#aa44ff;font-family:'Noto Serif KR',serif">▲ ${selected.length}명 — 삼각/다각 구도 자동 분석</div>` : ''}
        </div>` : ''}
        <button class="cl-btn cl-btn-md cl-btn-purple" id="cl-madame-go" ${selected.length < 2 ? 'disabled' : ''}>
            ${selected.length < 2 ? `${Math.max(0, 2 - selected.length)}명 더 선택 필요` : `🔮 ${selected.length}명 궁합 보기`}
        </button>`;

    container.querySelector('#cl-ms-back')?.addEventListener('click', () => { state.madameCompatView = 'list'; renderActivePane(); });
    container.querySelector('#cl-same-toggle')?.addEventListener('click', () => { const s = getSettings(); s.allowSameGender = !s.allowSameGender; save(); renderMadameSetup(container); });
    container.querySelectorAll('.cl-madame-sel').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.id, char = getSettings().roster.find(c => c.id === id);
        if (!char) return;
        const idx = state.madameSetup.selected.findIndex(c => c.id === id);
        if (idx >= 0) state.madameSetup.selected.splice(idx, 1); else state.madameSetup.selected.push(char);
        renderMadameSetup(container);
    }));
    container.querySelector('#cl-madame-go')?.addEventListener('click', async () => {
        const { selected } = state.madameSetup;
        if (selected.length < 2) return;
        toastr.info('마담뚜가 점괘를 보는 중...');
        try {
            const compatText = await runCompatPrompt(selected, getSettings().allowSameGender);
            const scoreM = compatText.match(/총점[：:]\s*(\d+)/), typeM = compatText.match(/커플 유형[：:]\s*(.+)/);
            const score = scoreM ? parseInt(scoreM[1]) : Math.floor(65 + Math.random() * 30);
            const type = typeM ? typeM[1].trim() : '운명의 인연';
            const session = { id: 'madame_' + Date.now(), cast: selected.map(c => c.name), castIds: selected.map(c => c.id), allowSame: getSettings().allowSameGender, createdAt: new Date().toLocaleDateString('ko').slice(2).replace(/\. /g, '.'), compat: { score, type, triangle: selected.length === 3, poly: selected.length > 3, resultText: compatText }, scenarios: null };
            const s = getSettings(); s.madameList.unshift(session); save();
            state.activeMadameId = session.id; state.madameCompatView = 'result'; renderActivePane();
        } catch (e) { toastr.error(`궁합 분석 실패: ${e.message}`); }
    });
}

function renderMadameResult(container) {
    const settings = getSettings();
    const session = settings.madameList.find(m => m.id === state.activeMadameId);
    if (!session) { state.madameCompatView = 'list'; renderActivePane(); return; }
    const cast = session.castIds
        ? session.castIds.map(id => settings.roster.find(c => c.id === id)).filter(Boolean)
        : session.cast.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
    const compat = session.compat || {};
    const resultText = compat.resultText || '';

    function parseSection(text, icon) {
        const m = text.match(new RegExp(icon + '[^\\n]*\\n([\\s\\S]*?)(?=📊|💘|⚡|🎭|💑|🔺|🔥|$)', 'u'));
        return m ? m[1].trim() : '';
    }
    const scoreSection = parseSection(resultText, '📊');
    const dynamicSection = parseSection(resultText, '⚡');
    const genreSection = parseSection(resultText, '🎭');
    const deepSection = parseSection(resultText, '💑');
    const triSection = parseSection(resultText, '🔺');
    const sceneSection = parseSection(resultText, '🔥');

    const scoreLines = scoreSection.split('\n').filter(l => l.trim() && (l.includes(':') || l.includes('：')));
    const scoreItems = scoreLines.map(line => {
        const m = line.match(/(.+?)[：:]\s*(\d+)/);
        if (!m) return '';
        return `<div class="cl-score-row"><span class="cl-score-icon">✦</span><div class="cl-score-label">${esc(m[1].trim())}</div><div class="cl-score-bg"><div class="cl-score-fill" style="width:${m[2]}%"></div></div><div class="cl-score-val">${m[2]}</div></div>`;
    }).join('');

    container.innerHTML = `
    <div style="background:linear-gradient(180deg,#1a0030,#0a0018);border-bottom:2px solid #8800cc88;padding:14px;text-align:center;position:relative">
        <button style="position:absolute;top:14px;left:14px;background:none;border:none;color:#551166;cursor:pointer;font-size:11px;font-family:monospace" id="cl-mr-back">◀ 목록</button>
        <div style="font-size:10px;color:#8844aa;letter-spacing:4px;font-family:'Noto Serif KR',serif;margin-bottom:6px">✦ 운명의 실이 얽혀 있도다 ✦</div>
        <div style="display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap">${cast.map((c, i) => `${i > 0 ? '<span style="color:#cc44ff;font-size:16px;text-shadow:0 0 8px #cc44ff">♥</span>' : ''}${renderAvatar(c.name, c.gender, 30)}<span style="font-size:12px;color:#ffccaa;font-family:\'Noto Serif KR\',serif;font-weight:700">${esc(c.name)}</span>`).join('')}</div>
        ${compat.triangle ? '<div style="margin-top:6px;font-size:11px;color:#aa44ff;font-family:\'Noto Serif KR\',serif">🔺 삼각관계의 기운이 감돌도다</div>' : compat.poly ? '<div style="margin-top:6px;font-size:11px;color:#aa44ff">💫 다각의 인연이로다</div>' : ''}
    </div>
    <div style="padding:14px;background:#080010">
        <div class="cl-compat-score-box cl-pulse-gold">
            <div style="font-size:10px;color:#8844aa;letter-spacing:3px;font-family:'Noto Serif KR',serif;margin-bottom:8px">이 인연의 점괘는...</div>
            <div class="cl-compat-score-num">${compat.score}</div>
            <div style="font-size:9px;color:#664433;margin-top:4px">/ 100점</div>
            <div class="cl-compat-type">「${esc(compat.type)}」</div>
            <div class="cl-compat-comment">${compat.score >= 85 ? '타오르는 불꽃이로다... 서로를 태울 운명이니.' : '인연의 실이 엉켜있구나. 풀기엔 이미 늦었느니라.'}</div>
        </div>
        ${renderAccordion('📊', '항목별 궁합 점수', '각 기운의 수치를 보여드리리다', scoreItems || `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(scoreSection)}</div>`)}
        ${renderAccordion('⚡', '관계의 기운', '쫓는 자와 도망치는 자의 인연...', `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(dynamicSection)}</div>`)}
        ${renderAccordion('🎭', '예상 장르 TOP 3', '이 인연에 가장 잘 어울리는 이야기...', `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(genreSection)}</div>`)}
        ${renderAccordion('💑', '궁합 심층 분석', '잘 어울리는 점 · 충돌 · 장기 전망', `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(deepSection)}</div>`)}
        ${compat.triangle || compat.poly ? renderAccordion('🔺', '다각 구도 분석', '키맨은 누구인가? 구도가 보이는도다', `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(triSection)}</div>`) : ''}
        ${renderAccordion('🔥', '터질 것 같은 명장면 TOP 3', '반드시 일어날 씬들이 보이는도다', `<div style="padding-top:10px;font-size:12px;color:#ccaa77;line-height:2;font-family:'Noto Serif KR',serif;white-space:pre-wrap">${esc(sceneSection)}</div>`)}
        <div style="margin-top:4px">
            ${renderDivider('롤플 시나리오 추천', '#cc44ff')}
            <div id="cl-scenario-area">${session.scenarios ? renderScenarioCards(session.scenarios) : '<button class="cl-btn cl-btn-md cl-btn-purple" id="cl-gen-scenarios">📖 시나리오 생성</button>'}</div>
        </div>
    </div>`;

    container.querySelector('#cl-mr-back')?.addEventListener('click', () => { state.madameCompatView = 'list'; renderActivePane(); });
    container.querySelectorAll('.cl-accordion-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    container.querySelector('#cl-gen-scenarios')?.addEventListener('click', async () => {
        container.querySelector('#cl-scenario-area').innerHTML = '<div class="cl-loading"><div class="cl-spinner">🔮</div><br>시나리오를 엮는 중...</div>';
        try {
            const t = await runScenarioPrompt(cast, compat.resultText);
            session.scenarios = t; save();
            container.querySelector('#cl-scenario-area').innerHTML = renderScenarioCards(t);
            bindScenarioEvents(container);
        } catch (e) { container.querySelector('#cl-scenario-area').innerHTML = `<div style="color:#664433;font-size:12px">실패: ${esc(e.message)}</div>`; }
    });
    bindScenarioEvents(container);
}

function renderScenarioCards(text) {
    const blocks = text.split(/◆ 시나리오 \d+/).filter(b => b.trim());
    if (!blocks.length) return `<div style="background:linear-gradient(180deg,#150025,#0a0018);border:2px solid #330055;border-radius:2px;padding:13px;white-space:pre-wrap;font-size:12px;color:#aa8866;line-height:1.9;font-family:'Noto Serif KR',serif">${esc(text)}</div>`;
    return blocks.map((block, i) => {
        const gM = block.match(/장르[：:]\s*(.+)/), tM = block.match(/제목[：:]\s*"?(.+?)"?\n/);
        const genre = gM ? gM[1].trim() : `시나리오 ${i + 1}`, title = tM ? tM[1].trim() : '';
        return `<div class="cl-scenario-card" data-idx="${i}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div><div class="cl-scenario-genre">◆ ${esc(genre)}</div><div class="cl-scenario-title">${esc(title)}</div></div>
                <button class="cl-pin-btn" data-idx="${i}" style="background:none;border:1px solid #330055;border-radius:2px;padding:3px 8px;cursor:pointer;color:#551166;font-size:10px;font-family:monospace;white-space:nowrap">📌 고정</button>
            </div>
            <div class="cl-scenario-body">${esc(block.trim())}</div>
        </div>`;
    }).join('') + `<div style="display:flex;gap:8px;margin-top:8px"><button class="cl-btn cl-btn-sm cl-btn-purple" id="cl-reroll-scenarios" style="flex:1">🔄 리롤</button></div>`;
}

function bindScenarioEvents(container) {
    container.querySelectorAll('.cl-pin-btn').forEach(btn => btn.addEventListener('click', () => {
        const card = btn.closest('.cl-scenario-card'), isPinned = card.classList.toggle('pinned');
        btn.textContent = isPinned ? '📌 고정됨' : '📌 고정';
        btn.style.color = isPinned ? '#cc44ff' : '#551166';
        btn.style.borderColor = isPinned ? '#cc44ff' : '#330055';
    }));
    container.querySelector('#cl-reroll-scenarios')?.addEventListener('click', async () => {
        const settings = getSettings(), session = settings.madameList.find(m => m.id === state.activeMadameId);
        if (!session) return;
        const cast = session.castIds ? session.castIds.map(id => settings.roster.find(c => c.id === id)).filter(Boolean) : session.cast.map(n => settings.roster.find(c => c.name === n)).filter(Boolean);
        const area = container.querySelector('#cl-scenario-area');
        area.innerHTML = '<div class="cl-loading"><div class="cl-spinner">🔮</div><br>다시 엮는 중...</div>';
        try {
            const t = await runScenarioPrompt(cast, session.compat?.resultText);
            session.scenarios = t; save();
            area.innerHTML = renderScenarioCards(t); bindScenarioEvents(container);
        } catch (e) { area.innerHTML = `<div style="color:#664433;font-size:12px">실패: ${esc(e.message)}</div>`; }
    });
}

// ═══════════════════════════════════════════
// 마담뚜 — 시뮬
// ═══════════════════════════════════════════
function renderMadameSim(container) {
    const settings = getSettings();
    const { selected, situation } = state.simSetup;

    const charRows = GENDER_SECTIONS.map(g => {
        const group = settings.roster.filter(c => c.gender === g.id);
        if (!group.length) return '';
        return `<div style="margin-bottom:10px">
            <div style="font-size:9px;color:${g.color};margin-bottom:6px;letter-spacing:2px;font-family:monospace">— ${g.label} —</div>
            ${group.map(char => {
                const inSel = !!selected.find(c => c.id === char.id);
                return `<div class="cl-sim-sel" data-id="${char.id}" style="background:${inSel ? 'linear-gradient(135deg,#2a0040,#1a0030)' : '#0f0018'};border:2px solid ${inSel ? '#cc44ff' : g.color + '33'};border-radius:2px;padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:5px">
                    ${renderAvatar(char.name, char.gender, 30)}
                    <div style="flex:1"><div style="font-size:12px;font-weight:700;color:${inSel ? '#ffccaa' : '#cc9966'};font-family:'Noto Serif KR',serif">${esc(char.name)}</div><div style="font-size:10px;color:#664455">${esc(char.parsed?.job || '—')}</div></div>
                    ${inSel ? '<span style="color:#cc44ff;font-size:16px;text-shadow:0 0 8px #cc44ff">♥</span>' : ''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div style="font-size:13px;font-weight:900;color:#cc44ff;font-family:monospace;letter-spacing:1px;margin-bottom:12px;text-shadow:0 0 6px #cc44ff88">🎲 상황 시뮬레이터</div>
        <div style="font-size:11px;color:#664455;line-height:1.7;margin-bottom:14px;font-family:'Noto Serif KR',serif">캐릭터들을 선택하고 상황을 입력하면, 그 상황에서 어떻게 반응하고 전개될지 시뮬합니다.</div>
        ${renderDivider('참가자 선택', '#cc44ff')}
        ${charRows || `<div style="color:#441155;font-size:12px;font-family:monospace;padding:10px 0">등록된 캐릭터 없음</div>`}
        ${renderDivider('상황 설정', '#cc44ff')}
        <textarea class="cl-input cl-textarea" id="cl-sim-situation" rows="4" placeholder="예) 두 사람이 좁은 엘리베이터에 단둘이 갇혔다.&#10;예) 오랫동안 피해왔던 상대를 회사 회식에서 마주쳤다.&#10;예) 비를 피하려다 같은 카페에 들어갔다." style="margin-bottom:12px">${esc(situation)}</textarea>
        ${selected.length >= 1 ? `<div style="background:linear-gradient(135deg,#1a0030,#0f0018);border:1px solid #551166;border-radius:2px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${selected.map((c, i) => `${i > 0 ? '<span style="color:#cc44ff;font-size:12px">+</span>' : ''}${renderAvatar(c.name, c.gender, 22)}<span style="font-size:11px;color:#ffccaa;font-family:\'Noto Serif KR\',serif">${esc(c.name)}</span>`).join('')}</div>` : ''}
        <button class="cl-btn cl-btn-md cl-btn-purple" id="cl-sim-go" ${selected.length < 1 ? 'disabled' : ''}>${selected.length < 1 ? '캐릭터를 선택하세요' : '🎲 시뮬 시작'}</button>
        ${state.simResult ? `<div style="margin-top:16px">${renderDivider('시뮬 결과', '#cc44ff')}<div class="cl-sim-output">${esc(state.simResult)}</div><button class="cl-btn cl-btn-md cl-btn-purple" id="cl-sim-reroll" style="margin-top:8px">🔄 다시 시뮬</button></div>` : ''}`;

    container.querySelectorAll('.cl-sim-sel').forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.id, char = getSettings().roster.find(c => c.id === id);
        if (!char) return;
        const idx = state.simSetup.selected.findIndex(c => c.id === id);
        if (idx >= 0) state.simSetup.selected.splice(idx, 1); else state.simSetup.selected.push(char);
        renderMadameSim(container);
    }));
    container.querySelector('#cl-sim-situation')?.addEventListener('input', e => state.simSetup.situation = e.target.value);

    async function doSim() {
        if (!state.simSetup.selected.length) return;
        toastr.info('시뮬 중...');
        try {
            const r = await runSimPrompt(state.simSetup.selected, state.simSetup.situation);
            state.simResult = r; renderMadameSim(container);
        } catch (e) { toastr.error(`시뮬 실패: ${e.message}`); renderMadameSim(container); }
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

    // connection-manager에서 저장된 프로필 목록 읽기
    const profiles = extensionSettings?.['connectionManager']?.profiles || [];
    const selectedProfileName = settings.selectedProfileName || '';

    const profileOptions = profiles.length
        ? profiles.map(p =>
            `<option value="${esc(p.name)}" ${p.name === selectedProfileName ? 'selected' : ''}>${esc(p.name)}</option>`
          ).join('')
        : `<option value="">프로필 없음 (현재 연결 사용)</option>`;

    container.innerHTML = `
        ${renderDivider('연결 프로필 선택', '#ffaa00')}
        <div style="background:linear-gradient(135deg,#1a0a00,#0f0500);border:1px solid #ffaa0044;border-radius:2px;padding:13px 14px;margin-bottom:6px">
            <div style="font-size:10px;color:#886644;margin-bottom:8px;font-family:monospace">ST Connection Manager에 저장된 프로필 목록</div>
            <select id="cl-profile-select" style="width:100%;background:#0f0005;border:1px solid #ffaa0066;border-radius:2px;padding:8px 10px;color:#ffcc88;font-size:12px;font-family:monospace;outline:none;cursor:pointer">
                <option value="">현재 연결 그대로 사용</option>
                ${profileOptions}
            </select>
            ${profiles.length === 0 ? `<div style="font-size:10px;color:#664433;margin-top:6px;font-family:monospace">※ Connection Manager 확장에 프로필을 먼저 저장하세요</div>` : ''}
        </div>
        <div style="font-size:10px;color:#443322;line-height:1.8;font-family:monospace;background:#0f000a;border:1px solid #220011;border-radius:2px;padding:10px 12px;margin-bottom:20px">
            ※ 선택한 프로필로 캐릭터 분석·배틀·궁합 AI를 호출합니다<br>
            ※ "현재 연결 그대로"는 ST에서 활성화된 연결을 사용합니다<br>
            ※ 프로필 추가는 ST Connection Manager에서 하세요
        </div>
        ${renderDivider('저장 현황', '#ffaa00')}
        <div style="background:linear-gradient(135deg,#1a0010,#0f000a);border:1px solid #330022;border-radius:2px;padding:14px;margin-bottom:20px">
            <div class="cl-stat-count-grid">
                <div><div class="cl-stat-count-num" style="color:#ff44aa;text-shadow:0 0 8px #ff44aa88">${settings.roster.length}</div><div class="cl-stat-count-label">캐릭터</div></div>
                <div><div class="cl-stat-count-num" style="color:#ff2200;text-shadow:0 0 8px #ff220088">${settings.battleList.length}</div><div class="cl-stat-count-label">배틀</div></div>
                <div><div class="cl-stat-count-num" style="color:#cc44ff;text-shadow:0 0 8px #cc44ff88">${settings.madameList.length}</div><div class="cl-stat-count-label">궁합</div></div>
            </div>
            <div style="display:flex;gap:8px">
                <button id="cl-export-btn" style="flex:1;background:none;border:1px solid #330022;border-radius:2px;padding:8px;cursor:pointer;color:#664433;font-size:11px;font-family:monospace">📤 내보내기</button>
                <button id="cl-import-btn" style="flex:1;background:none;border:1px solid #330022;border-radius:2px;padding:8px;cursor:pointer;color:#664433;font-size:11px;font-family:monospace">📥 가져오기</button>
            </div>
        </div>
        <div style="text-align:center;font-size:9px;color:#330022;font-family:monospace;letter-spacing:1px;padding-top:8px;border-top:1px solid #0d0d1a">
            CHARACTER LAB v1.0<br><span style="color:#220011">챗씨부인운명상담소</span>
        </div>`;

    // 프로필 선택 저장
    container.querySelector('#cl-profile-select')?.addEventListener('change', e => {
        const s = getSettings();
        s.selectedProfileName = e.target.value || null;
        save();
        toastr.success(e.target.value ? `프로필 "${e.target.value}" 선택됨` : '현재 연결 그대로 사용');
    });

    container.querySelector('#cl-export-btn')?.addEventListener('click', () => {
        const s = getSettings(), data = JSON.stringify(s, null, 2),
              blob = new Blob([data], { type: 'application/json' }),
              url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `character-lab-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(url); toastr.success('내보내기 완료');
    });
    container.querySelector('#cl-import-btn')?.addEventListener('click', () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = async e => {
            const file = e.target.files[0]; if (!file) return;
            try {
                const imported = JSON.parse(await file.text());
                if (imported.roster) {
                    const s = getSettings();
                    s.roster = imported.roster;
                    s.battleList = imported.battleList || [];
                    s.madameList = imported.madameList || [];
                    save(); toastr.success('가져오기 완료'); renderSettings(container);
                } else toastr.error('올바른 백업 파일이 아닙니다');
            } catch { toastr.error('가져오기 실패'); }
        };
        input.click();
    });
}

// ═══════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════
export async function onActivate() {
    console.log(`[${MODULE_NAME}] 활성화`);

    // ST Extensions 패널에 inline-drawer 형식으로 inject
    const drawerHtml = `
    <div class="inline-drawer" id="scouter-drawer">
        <div class="inline-drawer-toggle inline-drawer-header" id="scouter-drawer-toggle">
            <b>🔴 Scouter</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" id="scouter-drawer-content" style="padding:0">
            <!-- 패널은 열릴 때 렌더링 -->
            <div id="scouter-panel-root" style="min-height:200px"></div>
        </div>
    </div>`;

    // extensions_settings2 가 있으면 거기, 없으면 extensions_settings
    const target = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (target) {
        target.insertAdjacentHTML('beforeend', drawerHtml);
    } else {
        // fallback: body에 슬라이드 패널 방식
        document.body.insertAdjacentHTML('beforeend', createPanelHTML());
        document.getElementById('cl-close')?.addEventListener('click', () => {
            document.getElementById('character-lab-panel')?.classList.remove('open');
            state.isPanelOpen = false;
        });
    }

    // drawer 토글 — 열릴 때 패널 렌더링
    const drawerToggle = document.getElementById('scouter-drawer-toggle');
    const drawerContent = document.getElementById('scouter-drawer-content');
    const panelRoot = document.getElementById('scouter-panel-root');

    if (drawerToggle && panelRoot) {
        // ST inline-drawer 클릭 시 패널 주입
        drawerToggle.addEventListener('click', () => {
            // drawer가 열리는 타이밍에 패널 HTML 주입
            setTimeout(() => {
                if (!panelRoot.querySelector('#cl-header')) {
                    // 패널 껍데기가 없으면 생성
                    panelRoot.innerHTML = createPanelHTML().replace(
                        'id="character-lab-panel"',
                        'id="character-lab-panel" style="position:relative;transform:none;width:100%;border:none;box-shadow:none;height:auto;min-height:500px"'
                    );
                    // 닫기 버튼 숨기기 (drawer가 대신 처리)
                    const closeBtn = panelRoot.querySelector('#cl-close');
                    if (closeBtn) closeBtn.style.display = 'none';

                    // 이벤트 재바인딩
                    panelRoot.querySelectorAll('.cl-tab').forEach(btn =>
                        btn.addEventListener('click', () => switchTab(btn.dataset.tab))
                    );
                    panelRoot.querySelectorAll('.cl-madame-subtab').forEach(btn =>
                        btn.addEventListener('click', () => switchMadameSubtab(btn.dataset.subtab))
                    );
                }
                state.isPanelOpen = true;
                switchTab('roster');
                panelRoot.querySelector('.cl-tab[data-tab="roster"]')?.classList.add('active-roster');
            }, 50);
        });
    }

    // ESC 키
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && state.isPanelOpen) state.isPanelOpen = false;
    });

    console.log(`[${MODULE_NAME}] 초기화 완료 — ST Extensions 패널에 등록됨`);
}
