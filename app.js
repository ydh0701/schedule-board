/*
 * 일정 보드 — app.js 구조 요약 (빠른 파악용)
 * ------------------------------------------------
 * 데이터 모델
 *   task    { id, project, category, name, start:Date, end:Date, workingDays,
 *             progress(0~100), locked(마스터 앵커 여부), fixed(날짜 고정/수정불가 여부),
 *             ownerPlanner(기획자가 추가한 업무일 때만 planner.id) }
 *   planner { id, name, projects:[projectCode,...] }
 *
 * 전역 상태
 *   tasks[], planners[], EXCLUDE_KEYWORDS[], HOLIDAYS(Map), manualCompleted(Set)
 *   view('project'|'planner'), selectedProject, selectedPlanner, selectedPlannerProject
 *
 * 주요 함수 맵
 *   parseAndAppend()      마스터 일정표 붙여넣기 파싱 (2트랙/3트랙 자동 감지)
 *   recalcAll()           project+ownerPlanner 단위로 '연결'된 업무 날짜 재계산
 *   computeConflicts()    프로젝트별 업무 겹침 계산 (EXCLUDE_KEYWORDS/같은 행은 제외)
 *   autoFillTemplate()    PC_TEMPLATE/MOBILE_TEMPLATE를 프로젝트에 자동 배치
 *   renderProjectView()   좌측 사이드바 트리 + 대시보드 + 선택 프로젝트 테이블
 *   renderPlannerView()   기획자 사이드바 + 담당 프로젝트 탭 + 캘린더
 *   renderCalendar()      요일/공휴일 음영 포함 일정 캘린더 그리기
 *   refreshHolidays()     date.nager.at 공개 API로 공휴일 자동 갱신 (Claude API 미사용)
 * ------------------------------------------------
 */

(async function(){

  let EXCLUDE_KEYWORDS = [
    "심사 제출","빌드 마감","런칭","체크",
    "후시 녹음","영상 편집","색보정","CG","캐스팅","오디션","시사","후반작업",
    "리소스-사진","리소스-영상","리소스-화보","화보 원본"
  ];
  const TODAY = new Date();
  const PALETTE = ["#e0a83f","#6a8caf","#6f9273","#b8503a","#a37fc7","#5fa3a8","#c78f5f","#8f9e5f"];

  // date -> name
  let HOLIDAYS = new Map([
    ["2025-12-25","크리스마스"],
    ["2026-01-01","신정"],["2026-02-16","설날연휴"],["2026-02-17","설날"],["2026-02-18","설날연휴"],
    ["2026-03-01","삼일절"],["2026-03-02","대체공휴일(삼일절)"],["2026-05-05","어린이날"],
    ["2026-05-24","부처님오신날"],["2026-05-25","대체공휴일(부처님오신날)"],["2026-06-03","임시공휴일(지방선거)"],
    ["2026-06-06","현충일"],["2026-07-17","제헌절"],["2026-08-15","광복절"],["2026-08-17","대체공휴일(광복절)"],
    ["2026-09-24","추석연휴"],["2026-09-25","추석"],["2026-09-26","추석연휴"],["2026-10-03","개천절"],
    ["2026-10-05","대체공휴일(개천절)"],["2026-10-09","한글날"],["2026-12-25","크리스마스"],
    ["2027-01-01","신정"],["2027-02-06","설날연휴"],["2027-02-07","설날"],["2027-02-08","설날연휴"],
    ["2027-02-09","대체공휴일(설날)"],["2027-03-01","삼일절"],["2027-05-01","노동절"],["2027-05-03","대체공휴일(노동절)"],
    ["2027-05-05","어린이날"],["2027-05-13","부처님오신날"],["2027-06-06","현충일"],["2027-07-17","제헌절"],
    ["2027-08-15","광복절"],["2027-08-16","대체공휴일(광복절)"],["2027-09-14","추석연휴"],["2027-09-15","추석"],
    ["2027-09-16","추석연휴"],["2027-10-03","개천절"],["2027-10-04","대체공휴일(개천절)"],["2027-10-09","한글날"],
    ["2027-10-11","대체공휴일(한글날)"],["2027-12-25","크리스마스"],["2027-12-27","대체공휴일(크리스마스)"]
  ]);

  let tasks = [];      // {id, project, category, name, start, end, workingDays, progress, locked, fixed}
  let planners = [];   // {id, name, projects:[projectCode,...]}
  let manualCompleted = new Set(); // project codes manually marked as done regardless of task progress
  let view = 'project';
  let selectedProject = null;
  let selectedPlanner = null;
  let selectedPlannerProject = null;
  let showExcludePanel = false;
  let showPaste = false;
  let showDonePC = false;
  let showDoneMobile = false;
  let overviewGroupBy = 'project';

  function createRowMenu(actions){
    const wrap = document.createElement('div');
    wrap.style.position = 'relative'; wrap.style.display = 'inline-block';
    const btn = document.createElement('button');
    btn.className = 'tiny ghost row-menu-btn';
    btn.textContent = '⋯';
    btn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.row-menu-popover').forEach(p=>p.remove());
      const pop = document.createElement('div');
      pop.className = 'row-menu-popover';
      actions.forEach(a => {
        const item = document.createElement('button');
        item.className = 'row-menu-item';
        item.textContent = a.label;
        item.onclick = (ev) => { ev.stopPropagation(); pop.remove(); a.onClick(); };
        pop.appendChild(item);
      });
      wrap.appendChild(pop);
    };
    wrap.appendChild(btn);
    return wrap;
  }
  document.addEventListener('click', () => document.querySelectorAll('.row-menu-popover').forEach(p=>p.remove()));

  function createAddProjectButton(available, onAdd){
    const wrap = document.createElement('div');
    wrap.style.position = 'relative'; wrap.style.display = 'inline-block';
    const btn = document.createElement('button');
    btn.className = 'tiny ghost ptab-add';
    btn.textContent = '+';
    btn.title = available.length ? '담당 프로젝트 추가 (PC/모바일에 맞는 표준 기획 업무가 자동으로 채워집니다)' : '추가할 수 있는 프로젝트가 없습니다';
    btn.disabled = available.length === 0;
    btn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.row-menu-popover').forEach(p=>p.remove());
      const pop = document.createElement('div');
      pop.className = 'row-menu-popover';
      available.forEach(code => {
        const item = document.createElement('button');
        item.className = 'row-menu-item';
        item.textContent = code;
        item.onclick = (ev) => { ev.stopPropagation(); pop.remove(); onAdd(code); };
        pop.appendChild(item);
      });
      wrap.appendChild(pop);
    };
    wrap.appendChild(btn);
    return wrap;
  }

  // ---------------- Firestore: shared real-time storage ----------------
  function genId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  const db = firebase.firestore();
  const boardRef = db.collection('board').doc('shared');
  let firestoreReady = false;

  function serializeTask(t){
    return {
      id: t.id, project: t.project, category: t.category||'', name: t.name,
      start: dateToIso(t.start), end: dateToIso(t.end),
      workingDays: t.workingDays||1, progress: t.progress||0,
      locked: !!t.locked, fixed: !!t.fixed,
      ownerPlanner: t.ownerPlanner || null, rowGroup: t.rowGroup || null,
      supporters: Array.isArray(t.supporters) ? t.supporters : []
    };
  }
  function deserializeTask(o){
    return {
      id: o.id, project: o.project, category: o.category||'', name: o.name,
      start: isoToDate(o.start), end: isoToDate(o.end),
      workingDays: o.workingDays||1, progress: o.progress||0,
      locked: !!o.locked, fixed: !!o.fixed,
      ownerPlanner: o.ownerPlanner || null, rowGroup: o.rowGroup || undefined,
      supporters: Array.isArray(o.supporters) ? o.supporters : []
    };
  }

  // [수정] 디바운스 타이머가 정상적으로 Promise를 반환하여 비동기 await 흐름을 제어할 수 있도록 보완
  let persistTimer = null;
  let persistResolvers = [];
  function persist(){
    if(!firestoreReady) return Promise.resolve();
    clearTimeout(persistTimer);
    return new Promise((resolve) => {
      persistResolvers.push(resolve);
      persistTimer = setTimeout(async () => {
        const data = {
          tasks: tasks.map(serializeTask),
          planners: planners,
          excludeKeywords: EXCLUDE_KEYWORDS,
          manualCompleted: [...manualCompleted],
          holidays: [...HOLIDAYS.entries()].map(([d,n]) => ({d,n}))
        };
        try{ await boardRef.set(data); }
        catch(e){ console.error('저장 실패:', e); }
        finally {
          persistResolvers.forEach(res => res());
          persistResolvers = [];
        }
      }, 500);
    });
  }

  function applyRemoteData(data){
    tasks = (data.tasks||[]).map(deserializeTask);
    planners = data.planners || [];
    if(Array.isArray(data.excludeKeywords) && data.excludeKeywords.length) EXCLUDE_KEYWORDS = data.excludeKeywords;
    manualCompleted = new Set(data.manualCompleted||[]);
    (data.holidays||[]).forEach(h => HOLIDAYS.set(h.d, h.n));
  }

  function subscribeBoard(){
    boardRef.onSnapshot(doc => {
      if(doc.exists) applyRemoteData(doc.data());
      firestoreReady = true;
      rerender();
    }, err => {
      console.error('실시간 동기화 오류:', err);
      document.getElementById('holidayStatus').textContent = '⚠ 서버 연결 실패 — 새로고침해주세요';
    });
  }

  async function savePlanners(){ await persist(); }
  async function saveManualCompleted(){ await persist(); }
  async function saveExcludeKeywords(){ await persist(); }

  // ---------------- date helpers ----------------
  function dateToIso(d){ if(!d || isNaN(d.getTime())) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  function enablePickerOnClick(input){
    input.style.cursor = 'pointer';
    input.addEventListener('click', () => { if(!input.disabled && input.showPicker) input.showPicker(); });
  }
  function isoToDate(s){ if(!s) return null; const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function isWeekend(d){ const w=d.getDay(); return w===0||w===6; }
  function isHoliday(d){ return HOLIDAYS.has(dateToIso(d)); }
  function isNonWorking(d){ return isWeekend(d) || isHoliday(d); }
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function nextWorkingDay(d){ let r=addDays(d,1); while(isNonWorking(r)) r=addDays(r,1); return r; }
  function prevWorkingDay(d){ let r=addDays(d,-1); while(isNonWorking(r)) r=addDays(r,-1); return r; }
  function endFromWorkingDays(start, wd){
    wd = Math.max(1, wd||1);
    let d = new Date(start); let count=1;
    while(count < wd){ d = addDays(d,1); if(!isNonWorking(d)) count++; }
    return d;
  }
  function startFromWorkingDaysBackward(end, wd){
    wd = Math.max(1, wd||1);
    let d = new Date(end); let count=1;
    while(count < wd){ d = addDays(d,-1); if(!isNonWorking(d)) count++; }
    return d;
  }
  function workingDaysBetween(start,end){
    if(end < start) return 1;
    let d = new Date(start); let count = isNonWorking(d) ? 0 : 1;
    while(d < end){ d = addDays(d,1); if(!isNonWorking(d)) count++; }
    return Math.max(1,count);
  }
  function fmt(d){ return d ? dateToIso(d) : '?'; }
  function parseDateLoose(str){
    if(!str) return null;
    const m = str.match(/(\d+)\s*\.\s*(\d+)\s*\.\s*(\d+)/);
    if(!m) return null;
    let yy=parseInt(m[1],10), mo=parseInt(m[2],10), dd=parseInt(m[3],10);
    if(yy%100===99 || yy%100===0) return null;
    const y = yy<100?yy+2000:yy;
    const dt = new Date(y,mo-1,dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function colorFor(name){
    if(!name) return '#555';
    let h=0; for(let i=0;i<name.length;i++) h = name.charCodeAt(i) + ((h<<5)-h);
    return PALETTE[Math.abs(h) % PALETTE.length];
  }
  function matchesKeyword(name){ return EXCLUDE_KEYWORDS.some(k => name.includes(k)); }
  function overlaps(a,b){ return a.start <= b.end && b.start <= a.end; }
  function projectType(code){
    const norm = (code||'').replace(/[\s_]/g,'').toUpperCase();
    return /M$/.test(norm) ? 'mobile' : 'pc';
  }

  // ---------------- 앵커 탐색 헬퍼 ----------------
  function findAnchor(anchors, pred){ return anchors.find(pred); }
  const isKickoff   = a => a.name.includes('킥오프');
  const isConcept   = a => a.name.includes('컨셉') && a.name.includes('확정');
  const isUiStart   = a => a.name.includes('UI') && (a.name.includes('착수') || a.name.includes('투입'));
  const isPlanStart = a => a.name.includes('기획') && a.name.includes('투입');
  const isDemoJudgeQA  = a => a.name.includes('데모') && a.name.includes('심사') && a.name.includes('QA') && !a.name.includes('LQA');
  const isDemoJudge    = a => a.name.includes('데모') && a.name.includes('심사') && !a.name.includes('QA') && !a.name.includes('LQA');
  const isDemoLaunch   = a => a.name.includes('데모') && a.name.includes('런칭') && !a.name.includes('QA') && !a.name.includes('LQA') && !a.name.includes('대응');
  const isFinalJudgeQA = a => a.name.includes('완전판') && a.name.includes('심사') && a.name.includes('QA') && !a.name.includes('LQA');
  const isFinalJudge   = a => a.name.includes('완전판') && a.name.includes('심사') && !a.name.includes('QA') && !a.name.includes('LQA');
  const isFinalLaunch  = a => (a.name.includes('완전판') || a.name.includes('스토어')) && a.name.includes('런칭') && !a.name.includes('QA') && !a.name.includes('LQA') && !a.name.includes('대응');
  const isMobileLaunchQA = a => a.name.includes('완전판') && a.name.includes('런칭') && a.name.includes('QA') && !a.name.includes('LQA') && !a.name.includes('대응');
  const isDelivery  = a => a.name.includes('납품');

  function deliveryReviewDuration(name){ return (name.includes('1챕터') || name.includes('데모')) ? 2 : 5; }
  function deliveryReviewName(name){ return `(기획) ${name.replace('납품','검수')}`; }

  // ---------------- 순서 배치 빌더 ----------------
  function makeBuilder(){
    const out = [];
    let cursor = null;
    function place(cat, name, d, opts){
      opts = opts || {};
      let start, end, fixed = false;
      if(opts.sameAs){
        start = new Date(opts.sameAs.start); end = new Date(opts.sameAs.end);
        fixed = true;
      } else {
        start = cursor ? nextWorkingDay(cursor) : new Date(TODAY);
        end = endFromWorkingDays(start, d);
      }
      out.push({ cat, name, d, start, end, fixed });
      cursor = end;
    }
    function placeDelivery(cat, anchor){
      const d = deliveryReviewDuration(anchor.name);
      const start = new Date(anchor.start);
      const end = endFromWorkingDays(start, d);
      out.push({ cat, name: deliveryReviewName(anchor.name), d, start, end, fixed:true });
      if(!cursor || end > cursor) cursor = end;
    }
    function placeBackGroup(items, anchor){
      if(!anchor){ items.forEach(it => place(it.cat, it.name, it.d)); return; }
      let endCursor = new Date(anchor.end);
      const placed = [];
      for(let i=items.length-1;i>=0;i--){
        const it = items[i];
        const end = endCursor;
        const start = startFromWorkingDaysBackward(end, it.d);
        placed.unshift({ cat:it.cat, name:it.name, d:it.d, start, end, fixed:true });
        endCursor = prevWorkingDay(start);
      }
      placed.forEach(p => out.push(p));
      cursor = placed[placed.length-1].end;
    }
    return { out, place, placeDelivery, placeBackGroup, setCursor:(d)=>{ cursor = d; } };
  }

  function buildPCTasks(anchors){
    const b = makeBuilder();
    const kickoff = findAnchor(anchors, isKickoff);
    const concept = findAnchor(anchors, isConcept);
    const demoJudgeQA = findAnchor(anchors, isDemoJudgeQA);
    const demoJudge = findAnchor(anchors, isDemoJudge);
    const demoLaunch = findAnchor(anchors, isDemoLaunch);
    const finalJudgeQA = findAnchor(anchors, isFinalJudgeQA);
    const finalJudge = findAnchor(anchors, isFinalJudge);
    const finalLaunch = findAnchor(anchors, isFinalLaunch);
    const deliveries = anchors.filter(a => isDelivery(a) && !matchesKeyword(a.name));
    const finalDeliveries = deliveries.filter(a => a.name.includes('완전판'));
    const demoDeliveries = deliveries.filter(a => !a.name.includes('완전판'));

    b.setCursor(kickoff ? kickoff.end : null);

    b.place('아이디어','1) 파트너사와 아이디어 회의',1);
    b.place('아이디어','2) 파트너사에서 생각하는 FMV 게임 플레이',3);
    b.place('아이디어','2) 컨셉 및 시스템 제안서 작성',3);
    b.place('아이디어','3) 파트너사와 컨셉 및 시스템 회의',1,{sameAs:concept});

    b.place('준비','1) 초안 기획서 작성 (타코 PD 방향성 선확인)',10);
    b.place('준비','2) 프로젝트 변경점 정리 FMV 개발 마일스톤(전체 현황)',1);
    b.place('준비','2) 파트너사 리소스 요청서 작성 및 전달',1);
    b.place('준비','2) 파트너사 업적 필수 리스트 정리해서 전달',1);

    b.place('세부 기획서','1) 로비 기획서',3);
    b.place('세부 기획서','1) 환경설정 기획서',3);
    b.place('세부 기획서','2) 챕터리스트 기획서',5);
    b.place('세부 기획서','2) 챕터맵 기획서',5);
    b.place('세부 기획서','3) 인게임 기획서',5);
    b.place('세부 기획서','3) 인게임 엔딩 크레딧 기획서',5);
    b.place('세부 기획서','4) 랭킹 기획서',3);
    b.place('세부 기획서','4) 업적 기획서',3);
    b.place('세부 기획서','5) 앨범 기획서',3);

    if(demoDeliveries.length){ demoDeliveries.forEach(a => b.placeDelivery('데모 준비', a)); }
    else { b.place('데모 준비','1) 데모 분량 영상 검수',3); }
    b.place('데모 준비','2) 1차 데이터',5);
    b.place('데모 준비','2) 1차 업적 데이터',5);
    b.place('데모 준비','2) 1차 밸런스',5);
    b.place('데모 준비','3) 데모 런칭 기획서',3);
    b.place('데모 준비','3) 데모 사운드 기획',3);
    b.place('데모 준비','3) 1차 번역 요청 및 적용',3);
    b.place('데모 준비','4) 데모 심사 QA 및 대응 (영어랑 기능정도만)',3,{sameAs:demoJudgeQA});
    b.place('데모 준비','5) 데모 심사 제출',1,{sameAs:demoJudge});
    b.placeBackGroup([
      {cat:'데모 준비', name:'6) 데모 런칭 QA', d:5},
      {cat:'데모 준비', name:'7) 데모 런칭 QA 대응', d:5}
    ], demoLaunch);

    b.place('데모 런칭','1) 데모 런칭',1,{sameAs:demoLaunch});
    b.place('데모 런칭','1) 데모 모니터링',5);

    if(finalDeliveries.length){ finalDeliveries.forEach(a => b.placeDelivery('런칭 준비', a)); }
    else { b.place('런칭 준비','1) 완전판 분량 영상 검수',10); }
    b.place('런칭 준비','2) 2차 데이터',15);
    b.place('런칭 준비','2) 2차 업적 데이터',15);
    b.place('런칭 준비','2) 2차 밸런스',15);
    b.place('런칭 준비','3) 사운드 기획 마무리',3);
    b.place('런칭 준비','3) 2차 번역 요청 및 적용',3);
    b.place('런칭 준비','4) 완전판 심사 QA 및 대응',5,{sameAs:finalJudgeQA});
    b.place('런칭 준비','5) 완전판 심사 제출',1,{sameAs:finalJudge});
    b.place('런칭 준비','6) 스팀 업적 세팅',3);
    b.place('런칭 준비','6) 스팀 커뮤니티 뱃지 기획',3);
    b.placeBackGroup([
      {cat:'런칭 준비', name:'7) 완전판 런칭 QA', d:5},
      {cat:'런칭 준비', name:'8) 완전판 런칭 QA 대응', d:5}
    ], finalLaunch);

    b.place('완전판 런칭 후','1) 완전판 런칭',1,{sameAs:finalLaunch});
    b.place('완전판 런칭 후','1) 완전판 모니터링',5);

    return b.out;
  }

  function buildMobileTasks(anchors){
    const b = makeBuilder();
    const planStart = findAnchor(anchors, isPlanStart);
    const launchQA = findAnchor(anchors, isMobileLaunchQA);
    const finalLaunch = findAnchor(anchors, isFinalLaunch);

    b.setCursor(planStart ? planStart.end : null);

    b.place('준비','모바일 프로젝트 플레이 (BM 확인)',1);
    b.place('준비','PC01 M, PC04 M 현황 데이터 확인 (애널리틱스)',3);
    b.place('준비','BM 개선 전/후 기획서 및 데이터 확인',3);
    b.place('준비','BM 방향성 제안서 작성 (유지보수 필수)',5);
    b.place('준비','프로젝트 변경점 정리 FMV 개발 마일스톤(전체 현황)',1);
    b.place('세부 기획서','BM 방향성 제안서를 토대로 세부 기획서 작성',3);

    b.place('사전예약 준비','인앱 상품 등록 요청서 작성 및 글비실에 전달',3);
    b.place('사전예약 준비','1차 데이터',4);
    b.place('사전예약 준비','1차 광고 배치',2);
    b.place('사전예약 준비','사전예약 런칭 기획서',2);
    b.place('사전예약 준비','1차 번역 요청 및 적용',1);
    b.place('사전예약 준비','사전예약 심사 QA 및 대응',4);
    b.place('사전예약 준비','사전예약 심사 제출',1);
    b.place('사전예약 런칭','사전예약 시작',1);
    b.place('런칭 준비','완전판 사운드 기획',1);
    b.place('런칭 준비','앱이벤트 설계 (애널리틱스, 애드저스트, PFtool)',3);
    b.place('런칭 준비','앱이벤트 연결 확인 (유니티)',3);
    b.place('런칭 준비','2차 번역 요청 및 적용',1);
    b.placeBackGroup([
      {cat:'런칭 준비', name:'완전판 런칭 QA', d:5},
      {cat:'런칭 준비', name:'완전판 런칭 QA 대응', d:5}
    ], launchQA || finalLaunch);

    b.place('완전판 런칭 후','완전판 심사 제출',1);
    b.place('완전판 런칭 후','완전판 런칭',1,{sameAs:finalLaunch});
    b.place('완전판 런칭 후','개선 뭐 해야하는지 리뷰보고 체크',4);

    return b.out;
  }

  function autoFillTemplate(pl, code){
    const anchors = tasks.filter(t => t.project===code && t.locked).sort((a,b)=>a.start-b.start);
    const built = projectType(code) === 'mobile' ? buildMobileTasks(anchors) : buildPCTasks(anchors);
    built.forEach(item => {
      tasks.push({
        id: genId(), project: code, category: item.cat, name: item.name,
        start: item.start, end: item.end, workingDays: item.d, progress: 0,
        locked: false, fixed: item.fixed, ownerPlanner: pl.id
      });
    });
  }

  function normalizeName(s){ return (s||'').replace(/\s+/g,'').toLowerCase(); }
  function levenshtein(a,b){
    const m=a.length,n=b.length;
    if(m===0) return n; if(n===0) return m;
    const dp = Array.from({length:m+1},()=>new Array(n+1).fill(0));
    for(let i=0;i<=m;i++) dp[i][0]=i;
    for(let j=0;j<=n;j++) dp[0][j]=j;
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
    return dp[m][n];
  }
  function isSimilarName(a,b){
    const na=normalizeName(a), nb=normalizeName(b);
    if(!na || !nb) return false;
    if(na===nb) return true;
    const dist = levenshtein(na,nb);
    const threshold = Math.max(1, Math.floor(Math.min(na.length,nb.length)*0.3));
    return dist <= threshold;
  }

  // ---------------- holiday refresh ----------------
  async function refreshHolidays(){
    const btn = document.getElementById('refreshHolidaysBtn');
    const status = document.getElementById('holidayStatus');
    btn.disabled = true;
    status.innerHTML = '<span class="loading"><span class="spinner"></span>공휴일 확인 중...</span>';
    const y1 = TODAY.getFullYear();
    const years = [y1, y1+1, y1+2];
    try{
      let added = 0;
      for(const y of years){
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/KR`);
        if(!res.ok) throw new Error('서버 응답 오류 (' + res.status + ')');
        const data = await res.json();
        data.forEach(h => {
          if(!h.types || h.types.includes('Public')){
            if(!HOLIDAYS.has(h.date)){ HOLIDAYS.set(h.date, h.localName || h.name || '공휴일'); added++; }
          }
        });
      }
      const now = new Date();
      const stamp = dateToIso(now) + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      
      // [수정] 정상적인 비동기 처리가 보장됨
      try{ await persist(); }catch(e){}
      status.textContent = `공휴일 데이터: ${stamp} 자동 갱신 (신규 ${added}건)`;
      status.title = '';
      recalcAll(); await persist(); rerender();
    }catch(err){
      status.textContent = '자동 갱신 실패 — 기본값 유지';
      status.title = '인터넷 연결을 확인하시거나, 아래 "공휴일 직접 관리"로 직접 추가해주세요.';
    }
    btn.disabled = false;
  }
  document.getElementById('refreshHolidaysBtn').onclick = refreshHolidays;

  function renderHolidayManager(){
    const box = document.getElementById('holidayManagerPanel');
    box.innerHTML = `<h2>공휴일 직접 관리</h2><p class="sub">온라인 새로고침이 안 될 때(파일을 저장해서 브라우저로 직접 열었을 때 등) 여기서 공휴일을 손으로 추가하거나 지울 수 있습니다.</p>`;
    const list = document.createElement('div');
    list.style.maxHeight = '220px';
    list.style.overflowY = 'auto';
    list.style.marginBottom = '10px';
    const entries = [...HOLIDAYS.entries()].sort((a,b)=>a[0]<b[0]?-1:1);
    entries.forEach(([date,name]) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '4px';
      row.innerHTML = `<span class="foot-note" style="font-family:'IBM Plex Mono',monospace; min-width:90px;">${date}</span><span style="font-size:12.5px;">${name}</span>`;
      const del = document.createElement('button');
      del.className = 'tiny ghost'; del.textContent = '삭제'; del.style.marginLeft = 'auto';
      del.onclick = async () => { HOLIDAYS.delete(date); saveHolidaysManual(); renderHolidayManager(); recalcAll(); await persist(); rerender(); };
      row.appendChild(del);
      list.appendChild(row);
    });
    box.appendChild(list);

    const addRow = document.createElement('div'); addRow.className='row';
    const dateInput = document.createElement('input'); dateInput.type='date';
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.placeholder='공휴일 이름 (예: 임시공휴일)'; nameInput.style.width='160px';
    const addBtn = document.createElement('button'); addBtn.className='tiny primary'; addBtn.textContent='추가';
    addBtn.onclick = () => {
      if(!dateInput.value) return;
      HOLIDAYS.set(dateInput.value, nameInput.value || '공휴일');
      saveHolidaysManual();
      dateInput.value=''; nameInput.value='';
      recalcAll(); renderHolidayManager(); rerender();
    };
    addRow.appendChild(dateInput); addRow.appendChild(nameInput); addRow.appendChild(addBtn);
    box.appendChild(addRow);
  }
  async function saveHolidaysManual(){
    try{
      const now = new Date();
      const stamp = dateToIso(now) + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      await persist();
      document.getElementById('holidayStatus').textContent = `공휴일 데이터: ${stamp} 직접 수정`;
    }catch(e){}
  }
  document.getElementById('manageHolidaysBtn').onclick = () => {
    const box = document.getElementById('holidayManagerPanel');
    const show = box.style.display === 'none';
    box.style.display = show ? 'block' : 'none';
    if(show) renderHolidayManager();
  };

  // ---------------- parsing pasted schedule ----------------
  function parseTSVQuoted(text){
    const rows = []; let row = []; let field = ''; let inQuotes = false;
    for(let i=0;i<text.length;i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === '\t'){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else if(c === '\r'){ /* skip */ }
        else field += c;
      }
    }
    if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
    return rows;
  }

  function parseAndAppend(text){
    const rows = parseTSVQuoted(text).filter(r => r.some(c => c && c.trim()));
    let curProject = null, curCategory = '';
    rows.forEach(r => {
      const c0 = (r[0]||'').trim();
      if(c0 === '프로젝트' || (r[2]||'').trim() === '내용') return;

      if(c0){
        const lines = c0.split('\n').map(s=>s.trim()).filter(Boolean);
        curProject = lines[0] || c0;
      }
      if(!curProject) return;
      const category = (r[1]||'').trim();
      if(category) curCategory = category;

      const col2 = (r[2]||'').trim(), col3 = (r[3]||'').trim();
      const col4 = (r[4]||'').trim(), col5 = (r[5]||'').trim();
      const col6 = (r[6]||'').trim(), col7 = (r[7]||'').trim();
      const threeTrack = /^(TRUE|FALSE)$/i.test(col7);
      const isMaster = /^(TRUE|FALSE)$/i.test(col3) || /^(TRUE|FALSE)$/i.test(col5) || threeTrack;

      if(isMaster){
        const dateIdx = threeTrack ? 8 : 6;
        const startP = parseDateLoose((r[dateIdx]||'').trim());
        const endP = parseDateLoose((r[dateIdx+1]||'').trim());
        if(!endP) return;
        const start = startP || endP;
        const rowGroup = 'row' + genId();

        const rawItems = threeTrack
          ? [{name:col2,status:col3}, {name:col4,status:col5}, {name:col6,status:col7}]
          : [{name:col2,status:col3}, {name:col4,status:col5}];
        const candidates = rawItems.filter(it => it.name && it.name !== '-');

        const items = [];
        candidates.forEach(it => {
          const dup = items.find(x => isSimilarName(x.name, it.name));
          if(dup){ if(it.name.length > dup.name.length) dup.name = it.name; }
          else items.push({...it});
        });

        items.forEach(item => {
          tasks.push({
            id: genId(), project: curProject, category: curCategory, name: item.name,
            start: new Date(start), end: new Date(endP),
            workingDays: workingDaysBetween(start, endP),
            progress: /^TRUE$/i.test(item.status) ? 100 : 0,
            locked: true, fixed: false, rowGroup
          });
        });
      } else {
        const name = col3;
        if(!name) return;
        const start = parseDateLoose((r[4]||'').trim());
        let end = parseDateLoose((r[5]||'').trim());
        if(!end) end = start;
        if(!start) return;
        const wd = parseInt(r[6],10) || workingDaysBetween(start,end);
        const pct = parseInt(((r[7]||'').replace('%','')),10) || 0;
        tasks.push({ id: genId(), project: curProject, category: curCategory, name, start, end, workingDays: wd, progress: pct, locked:false, fixed:false });
      }
    });
  }

  // ---------------- cascade + conflicts ----------------
  function recalcAll(){
    const groups = new Map();
    tasks.forEach(t => {
      const key = t.project + '::' + (t.ownerPlanner || 'MASTER');
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    groups.forEach(list => {
      let prevEnd = null;
      list.forEach(t => {
        if(!t.fixed && !t.locked && prevEnd){
          t.start = nextWorkingDay(prevEnd);
          t.end = endFromWorkingDays(t.start, t.workingDays);
        }
        prevEnd = t.end;
      });
    });
  }

  function recalcFrom(editedTask){
    const key = editedTask.project + '::' + (editedTask.ownerPlanner || 'MASTER');
    const group = tasks.filter(t => (t.project+'::'+(t.ownerPlanner||'MASTER')) === key);
    const idx = group.indexOf(editedTask);
    if(idx === -1) return;
    let prevEnd = editedTask.end;
    for(let i=idx+1;i<group.length;i++){
      const t = group[i];
      if(!t.fixed && !t.locked){
        t.start = nextWorkingDay(prevEnd);
        t.end = endFromWorkingDays(t.start, t.workingDays);
      }
      prevEnd = t.end;
    }
  }
  function computeConflicts(){
    const conflicts = [];
    const projects = [...new Set(tasks.map(t=>t.project))];
    projects.forEach(p => {
      const list = tasks.filter(t=>t.project===p);
      for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++){
        const a=list[i], b=list[j];
        if(a.rowGroup && a.rowGroup===b.rowGroup) continue;
        if(overlaps(a,b) && !matchesKeyword(a.name) && !matchesKeyword(b.name)) conflicts.push({project:p,a,b});
      }
    });
    return conflicts;
  }

  // ---------------- modal ----------------
  function showSupportModal(t){
    const root = document.getElementById('modalRoot');
    if(!t.supporters) t.supporters = [];
    const mainOwner = planners.find(p => p.id === t.ownerPlanner);
    const current = planners.filter(p => t.supporters.includes(p.id));
    const available = planners.filter(p => p.id !== t.ownerPlanner && !t.supporters.includes(p.id));
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <h3 style="color:var(--text);">지원 기획자 관리</h3>
          <div class="foot-note" style="margin-bottom:8px;">"${t.name}"의 메인 담당자는 그대로 <b>${mainOwner?mainOwner.name:'?'}</b>님이고, 아래에서 지원 인력만 추가/해제합니다. 지원자의 업무량 화면에도 이 업무가 함께 표시돼요.</div>
          <div id="currentSupportList" style="margin-bottom:10px;"></div>
          <div class="foot-note" style="margin-bottom:6px;">+ 지원 추가</div>
          <div id="addSupportList" style="max-height:220px; overflow-y:auto;"></div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeSupportModal">닫기</button></div>
        </div>
      </div>`;
    const currentBox = document.getElementById('currentSupportList');
    if(current.length === 0){
      currentBox.innerHTML = '<div class="foot-note">현재 지원 인력 없음</div>';
    } else {
      current.forEach(p => {
        const chip = document.createElement('div'); chip.className='chip';
        chip.innerHTML = `<span>${p.name}</span>`;
        const del = document.createElement('button'); del.textContent='×';
        del.onclick = () => {
          t.supporters = t.supporters.filter(id => id !== p.id);
          recalcAll(); persist(); rerender();
          root.innerHTML = '';
        };
        chip.appendChild(del);
        currentBox.appendChild(chip);
      });
    }
    const addBox = document.getElementById('addSupportList');
    if(available.length === 0){
      addBox.innerHTML = '<div class="foot-note">추가할 수 있는 기획자가 없습니다.</div>';
    } else {
      available.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'sub-nav-item'; btn.style.marginBottom = '4px';
        btn.textContent = p.name;
        btn.onclick = () => {
          t.supporters.push(p.id);
          if(!p.projects.includes(t.project)) p.projects.push(t.project);
          savePlanners(); recalcAll(); persist(); rerender();
          root.innerHTML = '';
        };
        addBox.appendChild(btn);
      });
    }
    document.getElementById('closeSupportModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
  }

  function moveTask(t, dir){
    const groupIdx = [];
    tasks.forEach((x,i) => { if(x.project===t.project && x.ownerPlanner===t.ownerPlanner) groupIdx.push(i); });
    const curGlobal = tasks.indexOf(t);
    const pos = groupIdx.indexOf(curGlobal);
    const targetPos = pos + dir;
    if(pos === -1 || targetPos < 0 || targetPos >= groupIdx.length) return;
    const i1 = groupIdx[pos], i2 = groupIdx[targetPos];
    const tmp = tasks[i1]; tasks[i1] = tasks[i2]; tasks[i2] = tmp;
    recalcAll(); persist(); rerender();
  }

  function showConflictModal(c){
    const root = document.getElementById('modalRoot');
    const os = c.a.start > c.b.start ? c.a.start : c.b.start;
    const oe = c.a.end < c.b.end ? c.a.end : c.b.end;
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <h3>⚠ 일정이 겹칩니다</h3>
          <div class="line"><b>${c.a.locked?'🔒 ':''}${c.a.name}</b> <span class="range">${fmt(c.a.start)} ~ ${fmt(c.a.end)}</span></div>
          <div class="line"><b>${c.b.locked?'🔒 ':''}${c.b.name}</b> <span class="range">${fmt(c.b.start)} ~ ${fmt(c.b.end)}</span></div>
          <div class="line" style="color:var(--danger); margin-top:10px;">겹치는 구간: <span class="range">${fmt(os)} ~ ${fmt(oe)}</span></div>
          <div class="line foot-note">${c.a.locked||c.b.locked ? '고정 일정은 움직일 수 없으니, 다른 업무의 기간이나 연결 여부를 조정해주세요.' : '두 업무 중 하나의 날짜나 연결(체인) 여부를 조정해주세요.'}</div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="primary" id="closeModal">닫기</button></div>
        </div>
      </div>`;
    document.getElementById('closeModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
  }

  // ---------------- project view ----------------
  function taskRow(t, conflictIds){
    const tr = document.createElement('tr');
    if(t.locked) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='100%'; nameInput.value=t.name;
    // [수정] 텍스트 수정 완료(onchange) 시 깜빡이지 않게 데이터 저장만 가볍게 수행
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameTd.appendChild(nameInput);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.locked; startInput.style.width='100%'; enablePickerOnClick(startInput);
    startInput.onchange = () => { const d = isoToDate(startInput.value); if(!d) return; t.start = d; t.end = endFromWorkingDays(t.start, t.workingDays); recalcFrom(t); persist(); rerender(); };
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.disabled = t.locked; endInput.style.width='100%';
    endInput.onchange = () => { const d = isoToDate(endInput.value); if(!d) return; t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender(); }; enablePickerOnClick(endInput);
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.display='flex'; wdTd.style.alignItems='center'; wdTd.style.justifyContent='center'; wdTd.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){ t.workingDays=Math.max(1,v); t.end=endFromWorkingDays(t.start,t.workingDays); recalcFrom(t); persist(); rerender(); }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdTd.appendChild(minus); wdTd.appendChild(wdInput); wdTd.appendChild(plus);

    const pctTd = document.createElement('td'); pctTd.style.textAlign='center';
    const pctInput = document.createElement('input'); pctInput.type='number'; pctInput.value=t.progress; pctInput.min=0; pctInput.max=100;
    // [수정] 진행률 슬라이더/타이핑 변경 시 전체 화면 리렌더링 제거하여 끊김 해결
    pctInput.onchange = () => { t.progress = parseInt(pctInput.value,10)||0; persist(); };
    pctTd.appendChild(pctInput);

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    actTd.appendChild(createRowMenu([
      { label:'+ 아래에 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:t.category, name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt);
        recalcAll(); persist(); rerender();
      }},
      { label:'삭제', onClick: () => { tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender(); } }
    ]));

    [nameTd,startTd,endTd,wdTd,pctTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  function renderConflictPanel(container, conflicts){
    if(conflicts.length===0) return;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h2>확인이 필요한 겹침 (${conflicts.length}건)</h2>`;
    const list = document.createElement('div');
    conflicts.forEach(c => {
      const item = document.createElement('div'); item.className='conflict-item';
      item.innerHTML = `<span>${c.a.locked?'🔒 ':''}${c.a.name} ↔ ${c.b.locked?'🔒 ':''}${c.b.name}</span>`;
      const btn = document.createElement('button'); btn.className='tiny'; btn.textContent='자세히';
      btn.onclick = () => showConflictModal(c);
      item.appendChild(btn); list.appendChild(item);
    });
    panel.appendChild(list);
    container.appendChild(panel);
  }

  function projectStats(){
    const codes = [...new Set(tasks.map(t=>t.project))];
    return codes.map(code => {
      const list = tasks.filter(t=>t.project===code);
      const avgProgress = list.length ? Math.round(list.reduce((s,t)=>s+t.progress,0)/list.length) : 0;
      const done = manualCompleted.has(code) || (list.length>0 && list.every(t=>t.progress>=100));
      return { code, count:list.length, avgProgress, done, type: projectType(code) };
    });
  }

  function renderProjectSidebar(stats){
    const box = document.getElementById('sidebarExtra');
    box.innerHTML = '';
    function group(label, list, showDone, toggleShowDone){
      if(list.length === 0) return;
      const active = list.filter(s=>!s.done);
      const doneList = list.filter(s=>s.done);
      const lbl = document.createElement('div'); lbl.className='sidebar-group-label'; lbl.textContent = label;
      box.appendChild(lbl);
      const mkItem = (s) => {
        const item = document.createElement('button');
        item.className = 'sub-nav-item' + (s.code===selectedProject ? ' active' : '');
        item.innerHTML = `<span>${s.code}</span><span class="pct">${s.avgProgress}%${s.done?' ✅':''}</span>`;
        item.onclick = () => { selectedProject = s.code; rerender(); };
        return item;
      };
      active.forEach(s => box.appendChild(mkItem(s)));
      if(doneList.length > 0){
        const toggle = document.createElement('button');
        toggle.className = 'sub-nav-toggle';
        toggle.textContent = (showDone ? '▾' : '▸') + ` 완료됨 (${doneList.length})`;
        toggle.onclick = () => { toggleShowDone(); rerender(); };
        box.appendChild(toggle);
        if(showDone) doneList.forEach(s => box.appendChild(mkItem(s)));
      }
    }
    group('🖥️ PC 버전', stats.filter(s=>s.type==='pc'), showDonePC, ()=>{ showDonePC = !showDonePC; });
    group('📱 모바일 버전', stats.filter(s=>s.type==='mobile'), showDoneMobile, ()=>{ showDoneMobile = !showDoneMobile; });
  }

  function renderProjectView(){
    const main = document.getElementById('main');
    main.innerHTML = '';

    const stats = projectStats();
    if(!selectedProject || !stats.find(s=>s.code===selectedProject)){
      selectedProject = stats.length ? stats[0].code : null;
    }
    const inProgress = stats.filter(s=>!s.done).length;
    const done = stats.filter(s=>s.done).length;
    const pcCount = stats.filter(s=>s.type==='pc').length;
    const mobileCount = stats.filter(s=>s.type==='mobile').length;

    // ---- dashboard ----
    const dash = document.createElement('div');
    dash.className = 'panel';
    dash.innerHTML = `<div class="stats">
      <div class="stat"><div class="num">${stats.length}</div><div class="lbl">전체 프로젝트</div></div>
      <div class="stat" style="color:inherit;"><div class="num">${inProgress}</div><div class="lbl">진행중</div></div>
      <div class="stat ok"><div class="num">${done}</div><div class="lbl">완료</div></div>
      <div class="stat"><div class="num">🖥️ ${pcCount}</div><div class="lbl">PC 버전</div></div>
      <div class="stat"><div class="num">📱 ${mobileCount}</div><div class="lbl">모바일 버전</div></div>
    </div>`;
    main.appendChild(dash);

    // ---- paste panel ----
    if(showPaste){
      const loadPanel = document.createElement('div');
      loadPanel.className = 'panel';
      loadPanel.innerHTML = `
        <h2>일정 불러오기</h2>
        <p class="sub">두 형식 모두 지원합니다 — ① 프로젝트/분류/상태/업무명/시작일/종료일/작업일수/진행률 형식, ② 회사 마스터 일정표(TRUE·FALSE, 따옴표로 묶인 프로젝트명) 형식. 마스터 일정표에서 불러온 업무는 자동으로 "고정"으로 표시되고, 종료일이 99.xx.xx / 00.xx.xx 인 행은 자동으로 제외됩니다.</p>
        <textarea id="input" placeholder="일정표를 여기에 붙여넣으세요 (탭 구분 형식 그대로)"></textarea>
        <div class="row"><button class="primary" id="loadBtn">불러와서 추가하기</button></div>`;
      main.appendChild(loadPanel);
      document.getElementById('loadBtn').onclick = () => {
        const before = new Set(tasks.map(t=>t.project));
        parseAndAppend(document.getElementById('input').value);
        recalcAll();
        const after = [...new Set(tasks.map(t=>t.project))].find(p=>!before.has(p));
        if(after) selectedProject = after;
        showPaste = false;
        rerender();
      };
    }

    if(stats.length === 0){
      document.getElementById('sidebarExtra').innerHTML = '';
      const e = document.createElement('div'); e.className='empty';
      e.textContent = '아직 프로젝트가 없습니다. 위의 "+ 붙여넣기로 일정 추가"로 마스터 일정을 넣어주세요.';
      main.appendChild(e);
      return;
    }

    renderProjectSidebar(stats);

    // ---- selected project detail ----
    const sel = stats.find(s=>s.code===selectedProject);
    const conflictIds = new Set();

    const wrap = document.createElement('div'); wrap.className='panel';
    const head = document.createElement('div'); head.className='proj-head';
    const assignedPlanners = planners.filter(pl => pl.projects.includes(selectedProject)).map(pl => pl.name);
    const ownerText = ` · 담당자: ${assignedPlanners.length ? assignedPlanners.join(', ') : '미정'}`;
    head.innerHTML = `<span>${sel.type==='mobile'?'📱':'🖥️'} ${selectedProject}</span><span class="foot-note" style="font-weight:400;">${sel.type==='mobile'?'모바일':'PC'} · 평균 진행률 ${sel.avgProgress}% · 업무 ${sel.count}개${ownerText}</span>`;
    const headActions = document.createElement('div');
    headActions.style.marginLeft = 'auto';
    headActions.style.display = 'flex';
    headActions.style.flexDirection = 'column';
    headActions.style.gap = '4px';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'tiny ghost';
    doneBtn.textContent = manualCompleted.has(selectedProject) ? '완료 취소' : '완료 처리';
    doneBtn.onclick = () => {
      if(manualCompleted.has(selectedProject)) manualCompleted.delete(selectedProject);
      else manualCompleted.add(selectedProject);
      saveManualCompleted();
      rerender();
    };
    const delProjBtn = document.createElement('button'); delProjBtn.className='tiny ghost'; delProjBtn.textContent='프로젝트 삭제';
    delProjBtn.onclick = () => {
      if(confirm(`${selectedProject} 프로젝트의 모든 업무를 삭제할까요?`)){
        tasks = tasks.filter(t=>t.project!==selectedProject);
        manualCompleted.delete(selectedProject);
        saveManualCompleted();
        selectedProject = null;
        rerender();
      }
    };
    headActions.appendChild(doneBtn);
    headActions.appendChild(delProjBtn);
    head.appendChild(headActions);
    wrap.appendChild(head);

    // [수정] 헤더 고정 스크롤 적용을 위한 .table-wrap div 래퍼 감싸기
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.innerHTML = `<colgroup><col style="width:42%"><col style="width:14%"><col style="width:14%"><col style="width:16%"><col style="width:10%"><col style="width:4%"></colgroup><tr><th>업무명</th><th>시작일</th><th>종료일</th><th>기간</th><th>진행률</th><th></th></tr>`;
    tasks.filter(t=>t.project===selectedProject).forEach(t => table.appendChild(taskRow(t, conflictIds)));
    
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    main.appendChild(wrap);
  }

  // ---------------- calendar ----------------
  function buildDayMeta(minDate, maxDate){
    const days = []; let d = new Date(minDate);
    while(d <= maxDate){
      days.push({ date:new Date(d), iso:dateToIso(d), label:d.getDate(), monthLabel:`${d.getFullYear()}.${d.getMonth()+1}`,
        weekend:isWeekend(d), holiday:isHoliday(d), today:sameDay(d,TODAY) });
      d = addDays(d,1);
    }
    return days;
  }
  function renderCalendar(container, taskList, minDate, maxDate, conflictIds){
    const dayW = 20;
    const days = buildDayMeta(minDate, maxDate);
    const calWrap = document.createElement('div'); calWrap.className='cal-wrap';
    const inner = document.createElement('div'); inner.style.width=(days.length*dayW)+'px';

    const monthRow = document.createElement('div'); monthRow.className='cal-months';
    let i=0;
    while(i<days.length){
      let j=i; const m=days[i].monthLabel;
      while(j<days.length && days[j].monthLabel===m) j++;
      const seg = document.createElement('div'); seg.className='cal-month-label'; seg.style.width=((j-i)*dayW)+'px'; seg.textContent=m+'월';
      monthRow.appendChild(seg); i=j;
    }
    inner.appendChild(monthRow);

    const headerRow = document.createElement('div'); headerRow.className='cal-header-row';
    days.forEach(dm => {
      const cell = document.createElement('div');
      cell.className = 'cal-cell'+(dm.weekend?' weekend':'')+(dm.holiday?' holiday':'')+(dm.today?' today':'');
      cell.textContent = dm.label;
      cell.title = dm.iso + (dm.holiday?' (공휴일)':dm.weekend?' (주말)':'');
      headerRow.appendChild(cell);
    });
    inner.appendChild(headerRow);

    taskList.forEach(t => {
      const track = document.createElement('div'); track.className='cal-track';
      days.forEach(dm => {
        const cell = document.createElement('div');
        cell.className = 'cal-cell'+(dm.weekend?' weekend':'')+(dm.holiday?' holiday':'')+(dm.today?' today':'');
        track.appendChild(cell);
      });
      const startOffset = Math.round((t.start-minDate)/86400000);
      const span = Math.round((t.end-t.start)/86400000)+1;
      const bar = document.createElement('div');
      bar.className = 'cal-bar ' + (conflictIds.has(t.id) ? 'flag' : (t.locked?'locked':'normal'));
      bar.style.left = (startOffset*dayW)+'px'; bar.style.width = (span*span-2)+'px';
      bar.textContent = (t.locked?'🔒 ':'') + `[${t.project}] ` + t.name;
      bar.title = `${t.name} (${fmt(t.start)} ~ ${fmt(t.end)})`;
      track.appendChild(bar);
      inner.appendChild(track);
    });
    calWrap.appendChild(inner);
    container.appendChild(calWrap);
  }

  // ---------------- planner view ----------------
  function plannerTaskRow(t, conflictIds, viewerPlannerId){
    const tr = document.createElement('tr');
    if(t.fixed) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';
    const isSupportRow = viewerPlannerId && t.ownerPlanner !== viewerPlannerId;

    const nameTd = document.createElement('td');
    if(t.fixed){
      const lockBadge = document.createElement('span');
      lockBadge.textContent = '🔒 ';
      lockBadge.title = '마스터 일정 기준으로 날짜가 고정된 업무입니다';
      nameTd.appendChild(lockBadge);
    }
    if(isSupportRow){
      const badge = document.createElement('span');
      badge.className = 'tag anchor';
      badge.textContent = '지원';
      badge.style.marginRight = '6px';
      nameTd.appendChild(badge);
    }
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='220px'; nameInput.value=t.name;
    // [수정] 기획자 뷰 업무명 수정 시에도 깜빡임 제거
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameTd.appendChild(nameInput);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.fixed; startInput.style.width='100%';
    startInput.onchange = () => { const d = isoToDate(startInput.value); if(!d) return; t.start = d; t.end = endFromWorkingDays(t.start, t.workingDays); recalcFrom(t); persist(); rerender(); };
    enablePickerOnClick(startInput);
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.style.width='100%'; endInput.disabled = t.fixed;
    endInput.onchange = () => { const d = isoToDate(endInput.value); if(!d) return; t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender(); };
    enablePickerOnClick(endInput);
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.display='flex'; wdTd.style.alignItems='center'; wdTd.style.justifyContent='center'; wdTd.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){ t.workingDays=Math.max(1,v); t.end=endFromWorkingDays(t.start,t.workingDays); recalcFrom(t); persist(); rerender(); }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdTd.appendChild(minus); wdTd.appendChild(wdInput); wdTd.appendChild(plus);

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    actTd.appendChild(createRowMenu([
      { label:'+ 아래에 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:'', name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false, ownerPlanner:t.ownerPlanner };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt);
        recalcAll(); persist(); rerender();
      }},
      { label:'▲ 위로 이동', onClick: () => moveTask(t, -1) },
      { label:'▼ 아래로 이동', onClick: () => moveTask(t, 1) },
      { label:'지원 기획자 관리', onClick: () => showSupportModal(t) },
      { label:'삭제', onClick: () => { tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender(); } }
    ]));

    [nameTd,startTd,endTd,wdTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  function renderPlannerSidebar(){
    const box = document.getElementById('sidebarExtra');
    box.innerHTML = '';
    if(planners.length === 0) return;
    const lbl = document.createElement('div'); lbl.className='sidebar-group-label'; lbl.textContent = '기획자';
    box.appendChild(lbl);
    planners.forEach(pl => {
      const item = document.createElement('button');
      item.className = 'sub-nav-item' + (pl.id===selectedPlanner ? ' active' : '');
      item.innerHTML = `<span>${pl.name}</span><span class="pct">${pl.projects.length}개</span>`;
      item.onclick = () => { selectedPlanner = pl.id; rerender(); };
      box.appendChild(item);
    });
  }

  let plannerCalMonthCursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  function renderWorkloadSummary(container, pl){
    const ownTasks = tasks.filter(t => t.ownerPlanner === pl.id);
    const supportTasks = tasks.filter(t => t.ownerPlanner !== pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id));
    const allMyTasks = [...ownTasks, ...supportTasks].sort((a,b)=>a.start-b.start);
    if(allMyTasks.length === 0) return;

    const horizonEnd = addDays(TODAY, 60);
    let freeCount = 0, overloadCount = 0;
    let cursor = new Date(TODAY);
    while(cursor <= horizonEnd){
      if(!isNonWorking(cursor)){
        const load = allMyTasks.filter(t => t.start <= cursor && cursor <= t.end).length;
        if(load === 0) freeCount++;
        else if(load >= 2) overloadCount++;
      }
      cursor = addDays(cursor, 1);
    }

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h2>${pl.name} 전체 업무량 (담당+지원 프로젝트 전체 기준)</h2>
      <div class="stats" style="margin-bottom:8px;">
        <div class="stat"><div class="num">${allMyTasks.length}</div><div class="lbl">전체 업무 (지원 ${supportTasks.length}건 포함)</div></div>
        <div class="stat ok"><div class="num">${freeCount}</div><div class="lbl">앞으로 60일 중 여유일(근무일)</div></div>
        <div class="stat ${overloadCount>0?'warn':'ok'}"><div class="num">${overloadCount}</div><div class="lbl">2건 이상 겹치는 날</div></div>
      </div>`;
    container.appendChild(panel);

    const navRow = document.createElement('div');
    navRow.className = 'row'; navRow.style.marginTop = '0'; navRow.style.justifyContent = 'center';
    const prevBtn = document.createElement('button'); prevBtn.className = 'tiny ghost'; prevBtn.textContent = '◀';
    const label = document.createElement('div');
    label.style.fontFamily = "'Space Grotesk',sans-serif"; label.style.fontWeight = '700'; label.style.fontSize = '15px';
    label.style.minWidth = '90px'; label.style.textAlign = 'center';
    label.textContent = `${plannerCalMonthCursor.getFullYear()}.${String(plannerCalMonthCursor.getMonth()+1).padStart(2,'0')}`;
    const nextBtn = document.createElement('button'); nextBtn.className = 'tiny ghost'; nextBtn.textContent = '▶';
    const todayBtn = document.createElement('button'); todayBtn.className = 'tiny ghost'; todayBtn.textContent = '오늘';
    prevBtn.onclick = () => { plannerCalMonthCursor = new Date(plannerCalMonthCursor.getFullYear(), plannerCalMonthCursor.getMonth()-1, 1); rerender(); };
    nextBtn.onclick = () => { plannerCalMonthCursor = new Date(plannerCalMonthCursor.getFullYear(), plannerCalMonthCursor.getMonth()+1, 1); rerender(); };
    todayBtn.onclick = () => { plannerCalMonthCursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); rerender(); };
    navRow.appendChild(prevBtn); navRow.appendChild(label); navRow.appendChild(nextBtn); navRow.appendChild(todayBtn);
    container.appendChild(navRow);

    const calPanel = document.createElement('div');
    calPanel.className = 'panel';
    const items = allMyTasks.map(t => {
      const isSupport = t.ownerPlanner !== pl.id;
      return {
        start: t.start, end: t.end,
        label: `[${t.project}] ${t.name}${isSupport ? ' (지원)' : ''}`,
        onClick: () => { selectedPlannerProject = t.project; rerender(); }
      };
    });
    renderMonthGrid(calPanel, plannerCalMonthCursor, items);
    container.appendChild(calPanel);
  }

  function renderPlannerView(){
    const main = document.getElementById('main');
    main.innerHTML = '';

    if(!selectedPlanner || !planners.find(p=>p.id===selectedPlanner)){
      selectedPlanner = planners.length ? planners[0].id : null;
    }
    renderPlannerSidebar();

    if(planners.length === 0){
      const e = document.createElement('div'); e.className='empty';
      e.textContent = '등록된 기획자가 없습니다. 왼쪽 "+ 기획자 추가"로 추가해주세요.';
      main.appendChild(e);
      return;
    }

    const pl = planners.find(p=>p.id===selectedPlanner);
    const conflicts = computeConflicts();
    const conflictIds = new Set();
    conflicts.forEach(c => { conflictIds.add(c.a.id); conflictIds.add(c.b.id); });
    const allProjects = [...new Set(tasks.map(t=>t.project))];

    if(!selectedPlannerProject || !pl.projects.includes(selectedPlannerProject)){
      selectedPlannerProject = pl.projects.length ? pl.projects[0] : null;
    }

    const block = document.createElement('div'); block.className='planner-block';
    const headRow = document.createElement('div');
    headRow.style.display = 'flex'; headRow.style.alignItems = 'center'; headRow.style.gap = '10px'; headRow.style.flexWrap = 'wrap';

    const tabsRow = document.createElement('div'); tabsRow.className = 'ptabs'; tabsRow.style.flex = '1';
    pl.projects.forEach(code => {
      const tab = document.createElement('div');
      tab.className = 'ptab' + (code===selectedPlannerProject ? ' active' : '');
      const label = document.createElement('span'); label.textContent = code;
      tab.appendChild(label);
      tab.onclick = () => { selectedPlannerProject = code; rerender(); };
      const del = document.createElement('button'); del.textContent='×';
      del.onclick = (e) => {
        e.stopPropagation();
        if(confirm(`${code} 담당을 해제할까요? (이 프로젝트에 추가했던 기획 업무도 함께 삭제됩니다)`)){
          pl.projects = pl.projects.filter(c=>c!==code);
          tasks = tasks.filter(t => !(t.ownerPlanner===pl.id && t.project===code));
          if(selectedPlannerProject === code) selectedPlannerProject = null;
          savePlanners(); recalcAll(); persist(); rerender();
        }
      };
      tab.appendChild(del);
      tabsRow.appendChild(tab);
    });
    const available = allProjects.filter(p => !pl.projects.includes(p));
    tabsRow.appendChild(createAddProjectButton(available, (code) => {
      pl.projects.push(code);
      autoFillTemplate(pl, code);
      selectedPlannerProject = code;
      savePlanners();
      recalcAll();
      rerender();
    }));
    headRow.appendChild(tabsRow);

    const delPlBtn = document.createElement('button');
    delPlBtn.className = 'tiny ghost'; delPlBtn.textContent = '기획자 삭제';
    delPlBtn.onclick = () => {
      if(confirm(`${pl.name} 님을 삭제할까요? (이 기획자가 추가한 업무도 함께 삭제됩니다)`)){
        tasks = tasks.filter(t => t.ownerPlanner !== pl.id);
        planners = planners.filter(x=>x.id!==pl.id);
        selectedPlanner = null;
        savePlanners(); recalcAll(); persist(); rerender();
      }
    };
    headRow.appendChild(delPlBtn);
    block.appendChild(headRow);
    main.appendChild(block);

    const splitRow = document.createElement('div');
    splitRow.style.display = 'flex'; splitRow.style.gap = '14px'; splitRow.style.alignItems = 'flex-start';
    main.appendChild(splitRow);

    const leftCol = document.createElement('div'); leftCol.style.flex = '1'; leftCol.style.minWidth = '0';
    const rightCol = document.createElement('div');
    rightCol.style.flex = '1'; rightCol.style.minWidth = '0';
    rightCol.style.position = 'sticky'; rightCol.style.top = '18px'; rightCol.style.alignSelf = 'flex-start';
    rightCol.style.maxHeight = 'calc(100vh - 36px)'; rightCol.style.overflowY = 'auto';
    splitRow.appendChild(leftCol);
    splitRow.appendChild(rightCol);

    renderWorkloadSummary(rightCol, pl);

    const tabsBlock = document.createElement('div'); tabsBlock.className='planner-block';

    if(pl.projects.length === 0){
      const note = document.createElement('div'); note.className='foot-note'; note.style.marginTop='10px';
      note.textContent = allProjects.length===0
        ? '먼저 프로젝트별 일정에서 마스터 일정을 불러와주세요.'
        : '담당 프로젝트가 없습니다. + 버튼으로 프로젝트를 추가해주세요.';
      tabsBlock.appendChild(note);
    }

    const kwToggle = document.createElement('button');
    kwToggle.className = 'sub-nav-toggle';
    kwToggle.style.marginTop = '10px';
    kwToggle.textContent = (showExcludePanel ? '▾' : '▸') + ' 기획 업무와 무관한 항목 제외 설정';
    kwToggle.onclick = () => { showExcludePanel = !showExcludePanel; rerender(); };
    tabsBlock.appendChild(kwToggle);
    if(showExcludePanel){
      const kwPanel = document.createElement('div');
      kwPanel.style.marginTop = '8px';
      kwPanel.innerHTML = `<p class="sub">마스터 일정 중 촬영/영상 제작 쪽 업무(후시 녹음, 색보정, 캐스팅 등)는 고정 일정 참고 목록과 겹침 확인에서 제외됩니다. 업무명에 아래 단어가 포함되면 제외돼요.</p>`;
      const chipsWrap = document.createElement('div');
      EXCLUDE_KEYWORDS.forEach((k, idx) => {
        const chip = document.createElement('div'); chip.className='chip';
        chip.innerHTML = `<span>${k}</span>`;
        const del = document.createElement('button'); del.textContent='×';
        del.onclick = () => { EXCLUDE_KEYWORDS.splice(idx,1); saveExcludeKeywords(); rerender(); };
        chip.appendChild(del);
        chipsWrap.appendChild(chip);
      });
      kwPanel.appendChild(chipsWrap);
      const kwRow = document.createElement('div'); kwRow.className='row';
      const kwInput = document.createElement('input'); kwInput.type='text'; kwInput.placeholder='예: 오디션';
      const kwAddBtn = document.createElement('button'); kwAddBtn.className='tiny'; kwAddBtn.textContent='추가';
      kwAddBtn.onclick = () => {
        const v = kwInput.value.trim();
        if(v && !EXCLUDE_KEYWORDS.includes(v)){ EXCLUDE_KEYWORDS.push(v); saveExcludeKeywords(); rerender(); }
      };
      kwRow.appendChild(kwInput); kwRow.appendChild(kwAddBtn);
      kwPanel.appendChild(kwRow);
      tabsBlock.appendChild(kwPanel);
    }

    if(selectedPlannerProject){
      const code = selectedPlannerProject;
      const anchors = tasks.filter(t => t.project===code && t.locked && !matchesKeyword(t.name)).sort((a,b)=>a.start-b.start);
      const ownTasks = tasks.filter(t => t.project===code && (t.ownerPlanner===pl.id || (Array.isArray(t.supporters) && t.supporters.includes(pl.id))));

      const sub = document.createElement('div');
      sub.style.marginTop = '14px';
      sub.style.paddingTop = '10px';
      sub.style.borderTop = '1px solid var(--border)';

      // [수정] 클래스화하여 일관성 있게 헤더 고정 처리
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      const table = document.createElement('table');
      table.style.tableLayout = 'auto';
      table.style.minWidth = '600px';
      table.innerHTML = `<tr><th>기획 업무명</th><th>시작일</th><th>종료일</th><th>기간</th><th></th></tr>`;
      ownTasks.forEach(t => table.appendChild(plannerTaskRow(t, conflictIds, pl.id)));
      tableWrap.appendChild(table);
      sub.appendChild(tableWrap);

      const addTaskBtn = document.createElement('button');
      addTaskBtn.className = 'tiny'; addTaskBtn.textContent = `+ ${code} 기획 업무 추가`;
      addTaskBtn.onclick = () => {
        const afterAnchor = anchors[0];
        const start = afterAnchor ? nextWorkingDay(afterAnchor.end) : new Date(TODAY);
        const nt = { id:genId(), project:code, category:'', name:'새 기획 업무', start, workingDays:1, progress:0, locked:false, fixed:false, ownerPlanner:pl.id };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.push(nt);
        recalcAll(); persist(); rerender();
      };
      sub.appendChild(addTaskBtn);

      tabsBlock.appendChild(sub);
    }

    leftCol.appendChild(tabsBlock);
  }

  // ---------------- 전체 일정 캘린더 (월간 달력 형태) ----------------
  let overviewMonthCursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  function renderMonthGrid(container, monthDate, items){
    const year = monthDate.getFullYear(), month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const startWeekday = firstDay.getDay();

    const wrap = document.createElement('div');

    const head = document.createElement('div');
    head.style.display = 'grid'; head.style.gridTemplateColumns = 'repeat(7,1fr)'; head.style.marginBottom = '2px';
    ['일','월','화','수','목','금','토'].forEach((d,i) => {
      const c = document.createElement('div');
      c.textContent = d;
      c.style.textAlign = 'center'; c.style.fontSize = '11.5px'; c.style.padding = '6px 0'; c.style.fontWeight = '600';
      c.style.color = i===0 ? '#c9776a' : (i===6 ? '#6a8caf' : 'var(--text-dim)');
      head.appendChild(c);
    });
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(7,1fr)';
    grid.style.gap = '1px'; grid.style.background = 'var(--border)'; grid.style.borderRadius = '8px'; grid.style.overflow = 'hidden';

    const totalCells = Math.ceil((startWeekday + daysInMonth)/7) * 7;
    for(let i=0;i<totalCells;i++){
      const dayNum = i - startWeekday + 1;
      const cell = document.createElement('div');
      cell.style.minHeight = '92px'; cell.style.padding = '4px'; cell.style.overflow = 'hidden';
      if(dayNum < 1 || dayNum > daysInMonth){
        cell.style.background = 'var(--bg)';
      } else {
        cell.style.background = 'var(--panel)';
        const cellDate = new Date(year, month, dayNum);
        const isToday = sameDay(cellDate, TODAY);
        const num = document.createElement('div');
        num.textContent = dayNum;
        num.style.fontSize = '11px'; num.style.marginBottom = '3px';
        num.style.color = isToday ? 'var(--accent)' : 'var(--text-dim)';
        num.style.fontWeight = isToday ? '700' : '400';
        cell.appendChild(num);

        const dayItems = items.filter(it => it.start <= cellDate && cellDate <= it.end);
        dayItems.slice(0,4).forEach(it => {
          const pill = document.createElement('div');
          pill.textContent = it.label;
          pill.title = `${it.label} (${fmt(it.start)} ~ ${fmt(it.end)})`;
          pill.style.background = 'var(--accent-soft)'; pill.style.color = 'var(--accent)';
          pill.style.borderRadius = '4px'; pill.style.padding = '2px 5px'; pill.style.fontSize = '10.5px'; pill.style.fontWeight = '600';
          pill.style.marginBottom = '2px'; pill.style.overflow = 'hidden'; pill.style.textOverflow = 'ellipsis';
          pill.style.whiteSpace = 'nowrap'; pill.style.cursor = it.onClick ? 'pointer' : 'default';
          if(it.onClick) pill.onclick = it.onClick;
          cell.appendChild(pill);
        });
        if(dayItems.length > 4){
          const more = document.createElement('div');
          more.textContent = `+${dayItems.length-4}건 더`;
          more.style.fontSize = '9px'; more.style.color = 'var(--text-dim)';
          cell.appendChild(more);
        }
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  function renderOverviewView(){
    document.getElementById('sidebarExtra').innerHTML = '';
    const main = document.getElementById('main');
    main.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h2>전체 일정 캘린더</h2><p class="sub">달력에서 프로젝트 주요 일정이나 기획자별 업무를 한눈에 확인하세요. 항목을 클릭하면 상세 화면으로 이동합니다.</p>`;

    const controlRow = document.createElement('div');
    controlRow.className = 'row'; controlRow.style.marginTop = '0'; controlRow.style.justifyContent = 'space-between';

    const navGroup = document.createElement('div'); navGroup.className = 'row'; navGroup.style.marginTop = '0';
    const prevBtn = document.createElement('button'); prevBtn.className = 'tiny ghost'; prevBtn.textContent = '◀';
    const label = document.createElement('div');
    label.style.fontFamily = "'Space Grotesk',sans-serif"; label.style.fontWeight = '700'; label.style.fontSize = '15px';
    label.style.minWidth = '90px'; label.style.textAlign = 'center';
    label.textContent = `${overviewMonthCursor.getFullYear()}.${String(overviewMonthCursor.getMonth()+1).padStart(2,'0')}`;
    const nextBtn = document.createElement('button'); nextBtn.className = 'tiny ghost'; nextBtn.textContent = '▶';
    const todayBtn = document.createElement('button'); todayBtn.className = 'tiny ghost'; todayBtn.textContent = '오늘';
    prevBtn.onclick = () => { overviewMonthCursor = new Date(overviewMonthCursor.getFullYear(), overviewMonthCursor.getMonth()-1, 1); rerender(); };
    nextBtn.onclick = () => { overviewMonthCursor = new Date(overviewMonthCursor.getFullYear(), overviewMonthCursor.getMonth()+1, 1); rerender(); };
    todayBtn.onclick = () => { overviewMonthCursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); rerender(); };
    navGroup.appendChild(prevBtn); navGroup.appendChild(label); navGroup.appendChild(nextBtn); navGroup.appendChild(todayBtn);

    const toggleGroup = document.createElement('div'); toggleGroup.className = 'row'; toggleGroup.style.marginTop = '0';
    const pBtn = document.createElement('button'); pBtn.className = 'tiny ' + (overviewGroupBy==='project' ? 'primary' : 'ghost'); pBtn.textContent = '프로젝트별';
    const plBtn = document.createElement('button'); plBtn.className = 'tiny ' + (overviewGroupBy==='planner' ? 'primary' : 'ghost'); plBtn.textContent = '기획자별';
    pBtn.onclick = () => { overviewGroupBy = 'project'; rerender(); };
    plBtn.onclick = () => { overviewGroupBy = 'planner'; rerender(); };
    toggleGroup.appendChild(pBtn); toggleGroup.appendChild(plBtn);

    controlRow.appendChild(navGroup); controlRow.appendChild(toggleGroup);
    panel.appendChild(controlRow);
    main.appendChild(panel);

    const calPanel = document.createElement('div');
    calPanel.className = 'panel';

    const items = [];
    if(overviewGroupBy === 'project'){
      const stats = projectStats();
      stats.forEach(s => {
        const anchors = tasks.filter(t => t.project===s.code && t.locked);
        anchors.forEach(a => {
          items.push({
            start: a.start, end: a.end, label: `[${s.code}] ${a.name}`,
            onClick: () => { view='project'; selectedProject=s.code; syncNavActive(); rerender(); }
          });
        });
      });
    } else {
      planners.forEach(pl => {
        const own = tasks.filter(t => t.ownerPlanner===pl.id);
        const support = tasks.filter(t => t.ownerPlanner!==pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id));
        [...own, ...support].forEach(t => {
          items.push({
            start: t.start, end: t.end, label: `[${pl.name}] ${t.name}`,
            onClick: () => { view='planner'; selectedPlanner=pl.id; syncNavActive(); rerender(); }
          });
        });
      });
    }

    renderMonthGrid(calPanel, overviewMonthCursor, items);
    main.appendChild(calPanel);
  }

  // ---------------- master render ----------------
  function rerender(){
    if(view === 'project') renderProjectView();
    else if(view === 'planner') renderPlannerView();
    else renderOverviewView();
  }

  function syncNavActive(){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => {
      view = btn.dataset.view;
      syncNavActive();
      rerender();
    };
  });

  document.getElementById('sidebarPasteBtn').onclick = () => {
    if(view === 'project') showPaste = !showPaste;
    else { view = 'project'; showPaste = true; syncNavActive(); }
    rerender();
  };

  document.getElementById('sidebarAddPlannerBtn').onclick = () => {
    const name = prompt('기획자 이름을 입력하세요');
    if(!name) return;
    const pl = { id: genId(), name, projects: [] };
    planners.push(pl);
    savePlanners();
    view = 'planner';
    selectedPlanner = pl.id;
    syncNavActive();
    rerender();
  };

  subscribeBoard();
  rerender();
})();