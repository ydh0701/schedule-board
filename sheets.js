/*
 * sheets.js — 전체현황/기획팀/UI팀 세 구글 시트를 읽어와 프로젝트 기준으로 병합합니다.
 *
 * ⚠️ 아직 실제 구글 시트 주소를 못 받아서, 아래 SPREADSHEET_IDS 세 개는 자리표시자입니다.
 *    실제 주소를 받으면 이 세 값만 채워 넣으면 동작합니다. (파싱/병합 로직 자체는
 *    업로드해주신 엑셀 3개로 이미 검증했습니다 — classify_test.py 참고)
 */

const OAUTH_CLIENT_ID = '219583463660-nm5hjffu9i0hdrskbgubfukrti5gc8lh.apps.googleusercontent.com';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// TODO: 실제 구글 시트 URL 받으면 각 시트 주소의 /d/ 뒤 긴 문자열(스프레드시트 ID)로 채우기
const SPREADSHEET_IDS = {
  total: '',  // 전체 프로젝트 일정 관리
  plan: '',   // 기획팀 일정 관리
  ui: ''      // UI팀 일정 관리
};

let tokenClient = null;
let accessToken = null;

function initGoogleAuth(){
  if(!window.google || !google.accounts || !google.accounts.oauth2){ setTimeout(initGoogleAuth, 300); return; }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CLIENT_ID,
    scope: SHEETS_SCOPE,
    callback: (resp) => { accessToken = resp.access_token; }
  });
}
initGoogleAuth();

function ensureToken(){
  return new Promise((resolve, reject) => {
    if(accessToken){ resolve(accessToken); return; }
    if(!tokenClient){ reject(new Error('구글 인증이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')); return; }
    tokenClient.callback = (resp) => {
      if(resp.error){ reject(resp); return; }
      accessToken = resp.access_token;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken();
  });
}

// ---------------- 구글 시트 API 호출 ----------------
async function fetchSheetTitles(spreadsheetId, token){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if(!res.ok) throw new Error(`시트 목록을 못 가져왔습니다 (${spreadsheetId})`);
  const data = await res.json();
  return (data.sheets || []).map(s => s.properties.title);
}

async function fetchSheetValues(spreadsheetId, sheetTitle, token){
  const range = encodeURIComponent(`'${sheetTitle}'!A1:AZ3000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if(!res.ok) throw new Error(`"${sheetTitle}" 시트를 못 읽었습니다`);
  const data = await res.json();
  return data.values || []; // 2차원 배열, 행 우선
}

// ---------------- 프로젝트 코드 정리 (그룹핑 키만, 내용은 절대 안 건드림) ----------------
const CODE_RE = /^PC0*(\d+)\s*(M|모바일)?$/i;
function normalizeCode(raw){
  if(!raw) return null;
  const cleaned = String(raw).split('\n')[0].trim().replace(/\s+/g, '');
  const m = CODE_RE.exec(cleaned);
  if(!m) return null;
  const num = parseInt(m[1], 10);
  const mobile = !!m[2];
  return 'PC' + String(num).padStart(2, '0') + (mobile ? 'M' : '');
}

// ---------------- 1. 전체현황: PC 마일스톤 / M 마일스톤 시트 ----------------
// 열: B=프로젝트(가끔만 채워짐), C=분류(가끔만 채워짐), D=내용, E=상태(TRUE/FALSE), J=시작일, K=종료일
function parseMasterSheet(values){
  const rows = [];
  let curCode = null, curGroup = null;
  for(let r = 3; r < values.length; r++){ // 4행부터 (0-index 3)
    const row = values[r] || [];
    const projCell = row[1], groupCell = row[2], content = row[3], status = row[4];
    const start = row[9], end = row[10];
    if(projCell){ curCode = normalizeCode(projCell); }
    if(groupCell){ curGroup = groupCell; }
    if(!curCode) continue;
    if(!content && status === undefined) continue;
    rows.push({
      code: curCode, '분류': curGroup || null, '내용': content || null,
      '완료': status === true || status === 'TRUE',
      '시작일': start || null, '종료일': end || null
    });
  }
  return rows;
}

// ---------------- 2. 기획팀: 사람 이름 시트들 ----------------
// 열: A=프로젝트(가끔만 채워짐), B=세부내용, C=진행, D=업무, E=시작, F=종료, G=워킹데이, H=진척율
const PLAN_EXCLUDE_SHEETS = new Set(['R&R', '_복사용', '프로젝트1종 진행 시', 'TEST', 'holiday']);
function parsePlanSheet(sheetName, values){
  const rows = [];
  let curCode = null;
  for(let r = 2; r < values.length; r++){ // 3행부터
    const row = values[r] || [];
    const projCell = row[0], detail = row[1], progress = row[2], task = row[3];
    const start = row[4], end = row[5], wd = row[6], pct = row[7];
    if(projCell){ curCode = normalizeCode(projCell); }
    if(!curCode) continue;
    if(!task && !detail) continue;
    rows.push({
      code: curCode, '작업자': sheetName, '세부내용': detail || null, '진행상태': progress || null,
      '업무': task || null, '시작일': start || null, '종료일': end || null, '워킹데이': wd || null,
      '완료': pct === 1 || pct === '1' || pct === true
    });
  }
  return rows;
}

// ---------------- 3. UI팀: 프로젝트 코드 시트들 ----------------
// 열: B=작업자, E=내용, F=시작일, G=마감일, H=워킹데이, I=현황, J=완료(TRUE/FALSE), K=비고
const UI_EXCLUDE_SHEETS = new Set(['공휴일']);
const UI_EXCLUDE_EXTRA = new Set(['PC14C']); // 용도가 불확실해서 제외 확정된 시트
function parseUiSheet(sheetName, values){
  const code = normalizeCode(sheetName);
  if(!code) return [];
  const rows = [];
  for(let r = 1; r < values.length; r++){ // 2행부터
    const row = values[r] || [];
    const worker = row[1], content = row[4], start = row[5], end = row[6], wd = row[7];
    const status = row[8], done = row[9], note = row[10];
    if(!content) continue;
    rows.push({
      code, '작업자': worker || null, '내용': content, '시작일': start || null, '종료일': end || null,
      '워킹데이': wd || null, '진행상태': status || null, '완료': done === true || done === 'TRUE', '비고': note || null
    });
  }
  return rows;
}

// ---------------- 병합: 세 소스를 프로젝트 패밀리(PC+모바일) 기준으로 묶기 ----------------
function buildProgress(masterRows, planRows, uiRows){
  const pct = (items, isDone) => items.length ? Math.round(items.filter(isDone).length / items.length * 100) : null;
  return {
    master: pct(masterRows, x => x['완료']),
    plan: pct(planRows, x => x['완료']),
    ui: pct(uiRows, x => x['완료']),
    dev: null, server: null, qa: null, pm: null // 소스 없음
  };
}

function mergeIntoFamilies(masterRows, planRows, uiRows){
  const byCode = (rows) => {
    const m = new Map();
    rows.forEach(r => { if(!m.has(r.code)) m.set(r.code, []); m.get(r.code).push(r); });
    return m;
  };
  const masterByCode = byCode(masterRows);
  const planByCode = byCode(planRows);
  const uiByCode = byCode(uiRows);
  const allCodes = new Set([...masterByCode.keys(), ...planByCode.keys(), ...uiByCode.keys()]);

  const families = {};
  allCodes.forEach(code => {
    const isM = code.endsWith('M');
    const family = isM ? code.slice(0, -1) : code;
    const masterList = masterByCode.get(code) || [];
    const planList = planByCode.get(code) || [];
    const uiList = uiByCode.get(code) || [];
    const version = {
      code,
      masterAnchors: masterList,
      dept: { plan: planList, ui: uiList, dev: [], server: [], qa: [], pm: [] },
      progress: buildProgress(masterList, planList, uiList)
    };
    if(!families[family]) families[family] = { pc: null, m: null };
    families[family][isM ? 'm' : 'pc'] = version;
  });
  return families;
}

// ---------------- 전체 동기화 오케스트레이션 ----------------
async function fetchAllTabValues(spreadsheetId, token, excludeSet){
  const titles = await fetchSheetTitles(spreadsheetId, token);
  const result = [];
  for(const title of titles){
    if(excludeSet && excludeSet.has(title)) continue;
    const values = await fetchSheetValues(spreadsheetId, title, token);
    result.push({ title, values });
  }
  return result;
}

async function doFullSync(){
  const statusEl = document.getElementById('syncStatus');
  if(!SPREADSHEET_IDS.total || !SPREADSHEET_IDS.plan || !SPREADSHEET_IDS.ui){
    alert('아직 구글 시트 3개 주소가 설정되지 않았습니다. (sheets.js의 SPREADSHEET_IDS)');
    return;
  }
  try{
    if(statusEl) statusEl.textContent = '동기화 중…';
    const token = await ensureToken();

    // 1. 전체현황: PC 마일스톤 / M 마일스톤만 사용
    const totalTabs = await fetchAllTabValues(SPREADSHEET_IDS.total, token, null);
    let masterRows = [];
    totalTabs.forEach(({ title, values }) => {
      if(title === 'PC 마일스톤' || title === 'M 마일스톤') masterRows = masterRows.concat(parseMasterSheet(values));
    });

    // 2. 기획팀: 사람 이름 시트 전부
    const planTabs = await fetchAllTabValues(SPREADSHEET_IDS.plan, token, PLAN_EXCLUDE_SHEETS);
    let planRows = [];
    planTabs.forEach(({ title, values }) => { planRows = planRows.concat(parsePlanSheet(title, values)); });

    // 3. UI팀: 프로젝트 코드 시트 전부
    const uiExclude = new Set([...UI_EXCLUDE_SHEETS, ...UI_EXCLUDE_EXTRA]);
    const uiTabs = await fetchAllTabValues(SPREADSHEET_IDS.ui, token, uiExclude);
    let uiRows = [];
    uiTabs.forEach(({ title, values }) => { uiRows = uiRows.concat(parseUiSheet(title, values)); });

    families = mergeIntoFamilies(masterRows, planRows, uiRows);
    await persistSync();
    if(statusEl) statusEl.textContent = `방금 동기화됨 (${Object.keys(families).length}개 프로젝트)`;
    rerender();
  }catch(e){
    console.error('동기화 실패:', e);
    if(statusEl) statusEl.textContent = '⚠ 동기화 실패';
    alert('동기화 중 문제가 생겼습니다: ' + e.message);
  }
}
