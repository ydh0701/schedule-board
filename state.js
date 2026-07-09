/*
 * state.js — 데이터 모델, Firestore 저장/실시간 동기화, 날짜 계산, 스케줄링 핵심 로직
 * (화면을 직접 그리지 않는 파일. tasks/planners 등 전역 상태와 순수 계산 함수들)
 */

  let EXCLUDE_KEYWORDS = [
    "심사 제출","빌드 마감","런칭","체크",
    "후시 녹음","영상 편집","색보정","CG","캐스팅","오디션","시사","후반작업",
    "리소스-사진","리소스-영상","리소스-화보","화보 원본"
  ];
  const TODAY = new Date();
  const PALETTE = ["#6a8caf","#6f9273","#b8503a","#a37fc7","#5fa3a8","#c78f5f","#8f9e5f","#e0a83f"];

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

  let tasks = [];      
  let planners = [];   
  let manualCompleted = new Set(); 
  let view = 'project';
  let selectedProject = null;
  let selectedPlanner = null;
  let selectedPlannerProject = null;
  let showPaste = false;
  let showDonePC = false;
  let showDoneMobile = false;
  let collapsePC = false;
  let collapseMobile = false;
  let overviewGroupBy = 'project';

  function genId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  const db = firebase.firestore();
  const boardRef = db.collection('board').doc('shared');
  let firestoreReady = false;

  function serializeTask(t){
    return {
      id: t.id, project: t.project, category: t.category||'', name: t.name,
      start: dateToIso(t.start), end: dateToIso(t.end),
      workingDays: t.workingDays||1, progress: t.progress||0,
      locked: !!t.locked, fixed: !!t.fixed, done: !!t.done, memo: t.memo || '',
      ownerPlanner: t.ownerPlanner || null, rowGroup: t.rowGroup || null,
      supporters: Array.isArray(t.supporters) ? t.supporters : []
    };
  }
  function deserializeTask(o){
    return {
      id: o.id, project: o.project, category: o.category||'', name: o.name,
      start: isoToDate(o.start), end: isoToDate(o.end),
      workingDays: o.workingDays||1, progress: o.progress||0,
      locked: !!o.locked, fixed: !!o.fixed, done: !!o.done, memo: o.memo || '',
      ownerPlanner: o.ownerPlanner || null, rowGroup: o.rowGroup || undefined,
      supporters: Array.isArray(o.supporters) ? o.supporters : []
    };
  }

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
        catch(e){
          console.error('저장 실패:', e);
          const statusEl = document.getElementById('holidayStatus');
          if(statusEl){ statusEl.textContent = '⚠ 저장 실패 — 인터넷 연결 상태 확인 필요'; statusEl.style.color = 'var(--danger)'; }
        }
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
      document.getElementById('holidayStatus').textContent = '⚠ 서버 연결 실패 — 새로고침 필요';
    });
  }

  async function savePlanners(){ await persist(); }
  async function saveManualCompleted(){ await persist(); }

  // ---------------- Date Helpers ----------------
  function dateToIso(d){ if(!d || isNaN(d.getTime())) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  function isoToDate(s){ if(!s) return null; const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
  function sameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  const TODAY_START = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  function isDelayed(t){ return !t.done && !t.locked && t.end < TODAY_START; }
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
    if(!start || !end || end < start) return 1;
    let d = new Date(start); let count = isNonWorking(d) ? 0 : 1;
    while(d < end){ d = addDays(d,1); if(!isNonWorking(d)) count++; }
    return Math.max(1,count);
  }
  function fmt(d) { return d && !isNaN(d.getTime()) ? dateToIso(d) : '?'; }
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

  // ---------------- 앵커 매칭 ----------------
  function findAnchor(anchors, pred) { return anchors.find(pred); }
  const isKickoff   = a => a.name.includes('킥오프');
  const isConcept   = a => a.name.includes('컨셉') && a.name.includes('확정');
  const isDemoJudgeQA  = a => { const u=a.name.toUpperCase(); return a.name.includes('데모') && a.name.includes('심사') && u.includes('QA') && !u.includes('LQA'); };
  const isDemoJudge    = a => { const u=a.name.toUpperCase(); return a.name.includes('데모') && a.name.includes('심사') && !u.includes('QA') && !u.includes('LQA'); };
  const isDemoLaunch   = a => { const u=a.name.toUpperCase(); return a.name.includes('데모') && a.name.includes('런칭') && !u.includes('QA') && !u.includes('LQA') && !a.name.includes('대응'); };
  const isFinalJudgeQA = a => { const u=a.name.toUpperCase(); return a.name.includes('완전판') && a.name.includes('심사') && u.includes('QA') && !u.includes('LQA'); };
  const isFinalJudge   = a => { const u=a.name.toUpperCase(); return a.name.includes('완전판') && a.name.includes('심사') && !u.includes('QA') && !u.includes('LQA'); };
  const isFinalLaunch  = a => { const u=a.name.toUpperCase(); return (a.name.includes('완전판') || a.name.includes('스토어')) && a.name.includes('런칭') && !u.includes('QA') && !u.includes('LQA') && !a.name.includes('대응'); };
  const isMobileLaunchQA = a => { const u=a.name.toUpperCase(); return a.name.includes('완전판') && a.name.includes('런칭') && u.includes('QA') && !u.includes('LQA') && !a.name.includes('대응'); };
  const isDelivery  = a => a.name.includes('납품');
  const isUiStart   = a => { const u=a.name.toUpperCase(); return u.includes('UI') && a.name.includes('투입'); };

  function deliveryReviewDuration(name){ return (name.includes('1챕') || name.includes('데모')) ? 2 : 5; }
  function deliveryReviewName(name){ return `(기획) ${name.replace('납품','검수')}`; }

  // ---------------- 자동 템플릿 빌더 ----------------
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
    const planStart = findAnchor(anchors, a => a.name.includes('기획') && a.name.includes('투입'));
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
    const built = simulateTemplateTasks(code);
    built.forEach(item => {
      tasks.push({
        id: genId(), project: code, category: item.cat, name: item.name,
        start: item.start, end: item.end, workingDays: item.d, progress: 0,
        locked: false, fixed: item.fixed, ownerPlanner: pl.id
      });
    });
  }

  function simulateTemplateTasks(code){
    const anchors = tasks.filter(t => t.project===code && t.locked).sort((a,b)=>a.start-b.start);
    return projectType(code) === 'mobile' ? buildMobileTasks(anchors) : buildPCTasks(anchors);
  }

  // 마스터 앵커가 나중에 바뀌었을 때, 이미 생성된 기획자의 "고정(fixed)" 업무만
  // 최신 앵커 날짜로 다시 맞춥니다. 기획자가 직접 수정/추가한(fixed:false) 업무는 건드리지 않습니다.
  function resyncPlannerProjectAnchors(pl, code){
    const fresh = simulateTemplateTasks(code).filter(item => item.fixed);
    const existing = tasks.filter(t => t.project===code && t.ownerPlanner===pl.id && t.fixed);
    let updated = 0, added = 0;
    fresh.forEach(item => {
      const match = existing.find(t => t.name === item.name);
      if(match){
        match.start = new Date(item.start); match.end = new Date(item.end); match.workingDays = item.d;
        updated++;
      } else {
        tasks.push({
          id: genId(), project: code, category: item.cat, name: item.name,
          start: new Date(item.start), end: new Date(item.end), workingDays: item.d,
          progress: 0, locked: false, fixed: true, ownerPlanner: pl.id
        });
        added++;
      }
    });
    recalcAll(); persist(); rerender();
    return { updated, added };
  }

  function checkPlannerAvailability(code, pl){
    const candidateTasks = simulateTemplateTasks(code).filter(c => !matchesKeyword(c.name));
    const existing = tasks.filter(t =>
      (t.ownerPlanner === pl.id || (Array.isArray(t.supporters) && t.supporters.includes(pl.id))) &&
      t.project !== code && !matchesKeyword(t.name)
    );
    for(const cand of candidateTasks){
      for(const ex of existing){
        if(cand.start <= ex.end && ex.start <= cand.end){
          return { available:false, conflictWith: ex, overlapStart: cand.start>ex.start?cand.start:ex.start, overlapEnd: cand.end<ex.end?cand.end:ex.end };
        }
      }
    }
    return { available:true };
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

  // ---------------- 공휴일 매니저 ----------------
  async function refreshHolidays(){
    const btn = document.getElementById('refreshHolidaysBtn');
    const status = document.getElementById('holidayStatus');
    if(!btn) return;
    btn.disabled = true;
    status.innerHTML = '<span class="loading"><span class="spinner"></span>공휴일 확인 중...</span>';
    const y1 = TODAY.getFullYear();
    const years = [y1, y1+1, y1+2];
    try{
      let added = 0;
      for(const y of years){
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/KR`);
        if(!res.ok) throw new Error('서ver 응답 오류');
        const data = await res.json();
        data.forEach(h => {
          if(!h.types || h.types.includes('Public')){
            if(!HOLIDAYS.has(h.date)){ HOLIDAYS.set(h.date, h.localName || h.name || '공휴일'); added++; }
          }
        });
      }
      const now = new Date();
      const stamp = dateToIso(now) + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
      try{ await persist(); }catch(e){}
      status.textContent = `공휴일 데이터: ${stamp} 자동 갱신 (${added}건 추가)`;
      recalcAll(); await persist(); rerender();
    }catch(err){
      status.textContent = '자동 갱신 실패 — 기존 데이터 유지';
    }
    btn.disabled = false;
  }
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
        else if(c === '\r'){ }
        else field += c;
      }
    }
    if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
    return rows;
  }

  function parseRows(rows){
    const S = v => (v===null || v===undefined) ? '' : String(v);
    rows = rows.filter(r => r.some(c => S(c).trim()));
    let curProject = null, curCategory = '';
    const results = [];
    rows.forEach(r => {
      const c0 = S(r[0]).trim();
      if(c0 === '프로젝트' || S(r[2]).trim() === '내용') return;
      if(c0){
        const lines = c0.split('\n').map(s=>s.trim()).filter(Boolean);
        curProject = lines[0] || c0;
      }
      if(!curProject) return;
      const category = S(r[1]).trim();
      if(category) curCategory = category;

      const col2 = S(r[2]).trim(), col3 = S(r[3]).trim();
      const col4 = S(r[4]).trim(), col5 = S(r[5]).trim();
      const col6 = S(r[6]).trim(), col7 = S(r[7]).trim();
      const threeTrack = /^(TRUE|FALSE)$/i.test(col7);
      const isMaster = /^(TRUE|FALSE)$/i.test(col3) || /^(TRUE|FALSE)$/i.test(col5) || threeTrack;

      if(isMaster){
        const dateIdx = threeTrack ? 8 : 6;
        const startP = parseDateLoose(S(r[dateIdx]).trim());
        const endP = parseDateLoose(S(r[dateIdx+1]).trim());
        if(!endP) return;
        const start = startP || endP;
        const rowGroup = 'row' + genId();
        const rawItems = threeTrack ? [{name:col2,status:col3}, {name:col4,status:col5}, {name:col6,status:col7}] : [{name:col2,status:col3}, {name:col4,status:col5}];
        const candidates = rawItems.filter(it => it.name && it.name !== '-');
        const items = [];
        candidates.forEach(it => {
          const dup = items.find(x => isSimilarName(x.name, it.name));
          if(dup){ if(it.name.length > dup.name.length) dup.name = it.name; }
          else items.push({...it});
        });
        items.forEach(item => {
          results.push({
            id: genId(), project: curProject, category: curCategory, name: item.name,
            start: new Date(start), end: new Date(endP),
            workingDays: workingDaysBetween(start, endP),
            progress: /^TRUE$/i.test(item.status) ? 100 : 0,
            locked: true, fixed: false, rowGroup
          });
        });
      } else {
        const name = col3; if(!name) return;
        const start = parseDateLoose(S(r[4]).trim());
        let end = parseDateLoose(S(r[5]).trim()); if(!end) end = start;
        if(!start) return;
        const wd = parseInt(S(r[6]),10) || workingDaysBetween(start,end);
        const pct = parseInt(S(r[7]).replace('%',''),10) || 0;
        results.push({ id: genId(), project: curProject, category: curCategory, name, start, end, workingDays: wd, progress: pct, locked:false, fixed:false });
      }
    });
    return results;
  }

  function parseAndAppend(text){
    tasks.push(...parseRows(parseTSVQuoted(text)));
  }

  // ---------------- 구글 시트 연동 (OAuth 로그인 방식 — 시트를 공개하지 않아도 됨) ----------------
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

  // 특정 기획자의 전체 일정(담당+지원, 모든 프로젝트 통틀어) 안에서 겹치는 업무 쌍을 찾습니다.
  // 앵커 재동기화 후 "이 사람 일정이 이제 겹치게 됐는지" 확인하는 데 씁니다.
  function findPlannerConflicts(pl){
    const list = tasks.filter(t =>
      (t.ownerPlanner===pl.id || (Array.isArray(t.supporters) && t.supporters.includes(pl.id))) && !matchesKeyword(t.name)
    );
    const conflicts = [];
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++){
      const a=list[i], b=list[j];
      if(a.rowGroup && a.rowGroup===b.rowGroup) continue;
      if(overlaps(a,b)) conflicts.push({a,b});
    }
    return conflicts;
  }

  // 이 업무를 새 날짜로 옮겼을 때, 같은 프로젝트의 고정(마스터) 앵커와 겹치는지 확인합니다.
  // 겹치면 그 앵커를 반환하고, 아니면 null을 반환합니다.
  function findFixedAnchorOverlap(t, newStart, newEnd){
    if(matchesKeyword(t.name)) return null;
    const anchors = tasks.filter(x => x.project===t.project && x.locked && x.id!==t.id && !matchesKeyword(x.name));
    return anchors.find(a => newStart <= a.end && a.start <= newEnd) || null;
  }

  // ---------------- 모달 창 ----------------
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

  function computeAutoAssignPlan(){
    const allProjects = [...new Set(tasks.map(t=>t.project))];
    const unassigned = allProjects.filter(code => !planners.some(pl=>pl.projects.includes(code)));
    const staged = new Map();
    planners.forEach(pl => {
      const existing = tasks.filter(t => (t.ownerPlanner===pl.id || (Array.isArray(t.supporters) && t.supporters.includes(pl.id))) && !matchesKeyword(t.name));
      staged.set(pl.id, existing.map(t => ({start:t.start, end:t.end})));
    });
    const results = [];
    unassigned.forEach(code => {
      const candidate = simulateTemplateTasks(code).filter(c => !matchesKeyword(c.name));
      const order = planners.slice().sort((a,b) => staged.get(a.id).length - staged.get(b.id).length);
      let assigned = null;
      for(const pl of order){
        const existing = staged.get(pl.id);
        const conflict = candidate.some(cand => existing.some(ex => cand.start<=ex.end && ex.start<=cand.end));
        if(!conflict){ assigned = pl; break; }
      }
      if(assigned){
        candidate.forEach(c => staged.get(assigned.id).push({start:c.start, end:c.end}));
        results.push({ code, plannerId: assigned.id, plannerName: assigned.name, ok:true });
      } else {
        results.push({ code, plannerId:null, plannerName:null, ok:false });
      }
    });
    return results;
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

