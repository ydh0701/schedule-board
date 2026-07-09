/*
 * sheets.js — 구글 시트 연동 (OAuth 로그인 + Sheets API 호출)
 */

  const OAUTH_CLIENT_ID = '219583463660-nm5hjffu9i0hdrskbgubfukrti5gc8lh.apps.googleusercontent.com';
  const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const SPREADSHEET_ID = '1Ayc0tHFughRDG-0C_V_YJZdHz7GR-KKf2lt4HVlLQyQ';
  const SHEET_TABS = [
    { name: 'PC 마일스톤', label: 'PC' },
    { name: 'M 마일스톤', label: '모바일' }
  ];

  let googleTokenClient = null;
  let googleAccessToken = null;

  function initGoogleAuth(){
    if(!window.google || !google.accounts || !google.accounts.oauth2){ setTimeout(initGoogleAuth, 300); return; }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: SHEETS_SCOPE,
      callback: () => {} // 요청마다 아래에서 새로 지정합니다
    });
  }
  initGoogleAuth();

  function ensureGoogleAccessToken(){
    return new Promise((resolve, reject) => {
      if(!googleTokenClient){ reject(new Error('구글 인증 준비 중입니다. 잠시 후 다시 시도해주세요.')); return; }
      googleTokenClient.callback = (resp) => {
        if(resp.error){ reject(new Error('구글 로그인/권한 확인에 실패했습니다: ' + resp.error)); return; }
        googleAccessToken = resp.access_token;
        resolve(googleAccessToken);
      };
      // 이미 로그인/동의한 세션이 살아있으면 팝업 없이 조용히 토큰을 받아오고,
      // 아니면 구글 로그인 창을 띄웁니다.
      googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? '' : 'consent' });
    });
  }

  async function fetchSheetTab(tabName){
    const token = await ensureGoogleAccessToken();
    const range = encodeURIComponent(tabName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    let res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if(res.status === 401){
      // 토큰이 만료됐을 수 있으니 한 번 더 로그인 시도 후 재요청
      googleAccessToken = null;
      const freshToken = await ensureGoogleAccessToken();
      res = await fetch(url, { headers: { 'Authorization': `Bearer ${freshToken}` } });
    }
    if(!res.ok){
      const body = await res.json().catch(()=>({}));
      throw new Error(body?.error?.message || `${tabName} 불러오기 실패 (${res.status})`);
    }
    const data = await res.json();
    return data.values || [];
  }

  async function importFromGoogleSheets(btnId){
    const btn = document.getElementById(btnId || 'dashSheetsBtn');
    const originalText = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = '⏳ 구글 시트 불러오는 중...'; }
    try{
      const newTasks = [];
      for(const tab of SHEET_TABS){
        const rows = await fetchSheetTab(tab.name);
        newTasks.push(...parseRows(rows));
      }
      // 이미 있던 마스터(고정) 일정은 지우고 새로 받아온 것으로 교체합니다.
      // (그대로 두면 "갱신" 버튼을 누를 때마다 같은 프로젝트가 중복으로 계속 쌓여요.
      //  기획자가 직접 추가한 업무(locked:false)는 건드리지 않습니다.)
      const touchedProjects = new Set(newTasks.map(t => t.project));
      tasks = tasks.filter(t => !(t.locked && touchedProjects.has(t.project)));
      tasks.push(...newTasks);

      // 이 프로젝트들을 담당/지원하고 있던 기획자들의 고정 업무도 최신 앵커로 같이 맞춰줍니다.
      let resyncUpdated = 0, resyncAdded = 0;
      const affectedPlanners = new Set();
      planners.forEach(pl => {
        pl.projects.forEach(code => {
          if(!touchedProjects.has(code)) return;
          const { updated, added } = resyncPlannerProjectAnchors(pl, code);
          resyncUpdated += updated; resyncAdded += added;
          if(updated || added) affectedPlanners.add(pl);
        });
        // 지원으로만 들어간 프로젝트도 확인 (담당 프로젝트 목록엔 없어도 지원 업무가 있을 수 있음)
        const supportProjects = new Set(
          tasks.filter(t => t.ownerPlanner!==pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id) && touchedProjects.has(t.project))
            .map(t => t.project)
        );
        supportProjects.forEach(code => affectedPlanners.add(pl));
      });

      // 재동기화 후에도 이 사람들 일정에 겹침이 남아있는지 확인
      const conflictReport = [];
      affectedPlanners.forEach(pl => {
        const conflicts = findPlannerConflicts(pl);
        if(conflicts.length) conflictReport.push({ plannerName: pl.name, conflicts });
      });

      recalcAll(); persist(); rerender();
      showSheetsImportResultModal({
        projectCount: touchedProjects.size,
        resyncUpdated, resyncAdded,
        plannerCount: affectedPlanners.size,
        conflictReport
      });
    }catch(e){
      console.error(e);
      alert('구글 시트를 불러오지 못했습니다: ' + e.message);
    }
    if(btn){ btn.disabled = false; btn.textContent = originalText || '📊 구글 시트에서 가져오기'; }
  }



  // ---------------- 연쇄 계산 및 충돌 감지 ----------------
