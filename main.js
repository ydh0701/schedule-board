/*
 * main.js — 버튼 이벤트 연결 및 앱 시작 코드
 * (반드시 state.js, sheets.js, render.js를 먼저 불러온 뒤 로드해야 합니다)
 */

  const rBtn = document.getElementById('refreshHolidaysBtn');
  if(rBtn) rBtn.onclick = refreshHolidays;

  const mHoliBtn = document.getElementById('manageHolidaysBtn');
  if(mHoliBtn) {
    mHoliBtn.onclick = () => {
      const box = document.getElementById('holidayManagerPanel');
      const show = box.style.display === 'none';
      box.style.display = show ? 'block' : 'none';
      if(show) renderHolidayManager();
    };
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => { view = btn.dataset.view; syncNavActive(); rerender(); };
  });

  document.getElementById('sidebarPasteBtn').onclick = () => {
    if(view === 'project') showPaste = !showPaste; else { view = 'project'; showPaste = true; syncNavActive(); }
    rerender();
  };

  document.getElementById('sidebarAddPlannerBtn').onclick = () => {
    const name = prompt('추가할 기획자의 이름을 입력하세요:'); if(!name) return;
    const pl = { id: genId(), name, projects: [] }; planners.push(pl);
    savePlanners(); view = 'planner'; selectedPlanner = pl.id; syncNavActive(); rerender();
  };

  document.getElementById('sidebarAutoAssignBtn').onclick = () => showAutoAssignModal();

  subscribeBoard();
  rerender();
