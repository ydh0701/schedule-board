/*
 * render.js — 화면을 그리는 함수들 (프로젝트/기획자/캘린더 뷰, 모달, 행 렌더링)
 */

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
    btn.title = available.length ? '담당 프로젝트 추가' : '추가할 수 있는 프로젝트가 없습니다';
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

  // ---------------- Firestore Real-time Storage ----------------
  function enablePickerOnClick(input){
    input.style.cursor = 'pointer';
    input.addEventListener('click', () => { if(!input.disabled && input.showPicker) input.showPicker(); });
  }
  function showAssignPlannerModal(code){
    const root = document.getElementById('modalRoot');
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal" style="max-width:520px;">
          <h3 style="color:var(--text);">${code} 담당자 지정</h3>
          <div class="foot-note" style="margin-bottom:10px;">기획자별 일정을 파악해 겹치지 않는 팀원만 선택 가능합니다.</div>
          <div id="assignList" style="max-height:340px; overflow-y:auto;"></div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeAssignModal">닫기</button></div>
        </div>
      </div>`;
    const listBox = document.getElementById('assignList');
    if(planners.length === 0){
      listBox.innerHTML = '<div class="foot-note">등록된 기획자가 없습니다. 먼저 기획자를 추가해주세요.</div>';
    } else {
      planners.forEach(pl => {
        const alreadyAssigned = pl.projects.includes(code);
        const row = document.createElement('div');
        row.style.marginBottom = '8px'; row.style.padding = '10px 12px';
        row.style.border = '1px solid var(--border)'; row.style.borderRadius = '8px';
        if(alreadyAssigned){
          row.style.background = 'var(--ok-soft)';
          row.innerHTML = `<b>${pl.name}</b> <span class="foot-note">이미 담당 중인 프로젝트입니다 ✅</span>`;
        } else {
          const check = checkPlannerAvailability(code, pl);
          if(check.available){
            row.style.background = 'var(--ok-soft)'; row.style.cursor = 'pointer';
            row.innerHTML = `<b>${pl.name}</b> <span class="foot-note" style="color:var(--ok);">배정 가능 — 클릭 시 즉시 지정</span>`;
            row.onclick = () => {
              pl.projects.push(code);
              autoFillTemplate(pl, code);
              savePlanners(); recalcAll(); persist();
              root.innerHTML = '';
              rerender();
            };
          } else {
            row.style.background = 'var(--danger-soft)'; row.style.opacity = '0.85';
            const c = check.conflictWith;
            row.innerHTML = `<b>${pl.name}</b> <span class="foot-note" style="color:var(--danger);">일정 중복 — [${c.project}] "${c.name}" (${fmt(c.start)}~${fmt(c.end)})</span>`;
          }
        }
        listBox.appendChild(row);
      });
    }
    document.getElementById('closeAssignModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
  }

  function renderHolidayManager(){
    const box = document.getElementById('holidayManagerPanel');
    box.innerHTML = `<h2>공휴일 직접 관리</h2><p class="sub">수동으로 공휴일을 추가하거나 삭제할 수 있습니다.</p>`;
    const list = document.createElement('div');
    list.style.maxHeight = '220px'; list.style.overflowY = 'auto'; list.style.marginBottom = '10px';
    const entries = [...HOLIDAYS.entries()].sort((a,b)=>a[0]<b[0]?-1:1);
    entries.forEach(([date,name]) => {
      const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '4px';
      row.innerHTML = `<span class="foot-note" style="font-family:var(--font-mono); min-width:90px;">${date}</span><span style="font-size:13px;">${name}</span>`;
      const del = document.createElement('button'); del.className = 'tiny ghost'; del.textContent = '삭제'; del.style.marginLeft = 'auto';
      del.onclick = async () => { HOLIDAYS.delete(date); renderHolidayManager(); recalcAll(); await persist(); rerender(); };
      row.appendChild(del); list.appendChild(row);
    });
    box.appendChild(list);

    const addRow = document.createElement('div'); addRow.className='row';
    const dateInput = document.createElement('input'); dateInput.type='date';
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.placeholder='공휴일 설명'; nameInput.style.width='160px';
    const addBtn = document.createElement('button'); addBtn.className='tiny primary'; addBtn.textContent='추가';
    addBtn.onclick = () => {
      if(!dateInput.value) return;
      HOLIDAYS.set(dateInput.value, nameInput.value || '공휴일');
      dateInput.value=''; nameInput.value='';
      recalcAll(); renderHolidayManager(); rerender();
    };
    addRow.appendChild(dateInput); addRow.appendChild(nameInput); addRow.appendChild(addBtn);
    box.appendChild(addRow);
  }
  
  function showSupportModal(t){
    const root = document.getElementById('modalRoot');
    if(!t.supporters) t.supporters = [];
    const mainOwner = planners.find(p => p.id === t.ownerPlanner);
    const current = planners.filter(p => t.supporters.includes(p.id));
    const available = planners.filter(p => p.id !== t.ownerPlanner && !t.supporters.includes(p.id));
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <h3 style="color:var(--text);">지원 기획자 설정</h3>
          <div class="foot-note" style="margin-bottom:8px;">"${t.name}" 업무의 메인 담당자는 <b>${mainOwner?mainOwner.name:'미정'}</b>님입니다. 업무 지원 인력만 설정합니다.</div>
          <div id="currentSupportList" style="margin-bottom:10px;"></div>
          <div class="foot-note" style="margin-bottom:6px;">+ 지원 인력 배정</div>
          <div id="addSupportList" style="max-height:220px; overflow-y:auto;"></div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeSupportModal">닫기</button></div>
        </div>
      </div>`;
    const currentBox = document.getElementById('currentSupportList');
    if(current.length === 0){
      currentBox.innerHTML = '<div class="foot-note">현재 지정된 지원 기획자가 없습니다.</div>';
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
        chip.appendChild(del); currentBox.appendChild(chip);
      });
    }
    const addBox = document.getElementById('addSupportList');
    if(available.length === 0){
      addBox.innerHTML = '<div class="foot-note">지정 가능한 다른 기획자가 없습니다.</div>';
    } else {
      available.forEach(p => {
        const row = document.createElement('div'); row.style.marginBottom = '6px'; row.style.padding = '8px 10px'; row.style.border = '1px solid var(--border)'; row.style.borderRadius = '7px';
        let conflict = null;
        if(!matchesKeyword(t.name)){
          const existing = tasks.filter(t2 => (t2.ownerPlanner===p.id || (Array.isArray(t2.supporters) && t2.supporters.includes(p.id))) && t2.id !== t.id && !matchesKeyword(t2.name));
          for(const ex of existing){
            if(t.start <= ex.end && ex.start <= t.end){ conflict = { conflictWith: ex }; break; }
          }
        }
        if(!conflict){
          row.style.background = 'var(--ok-soft)'; row.style.cursor = 'pointer';
          row.innerHTML = `<b>${p.name}</b> <span class="foot-note" style="color:var(--ok);">배정 가능</span>`;
          row.onclick = () => {
            t.supporters.push(p.id);
            if(!p.projects.includes(t.project)) p.projects.push(t.project);
            savePlanners(); recalcAll(); persist(); rerender();
            root.innerHTML = '';
          };
        } else {
          const c = conflict.conflictWith;
          row.style.background = 'var(--danger-soft)'; row.style.opacity = '0.85';
          row.innerHTML = `<b>${p.name}</b> <span class="foot-note" style="color:var(--danger);">중복 — [${c.project}] ${c.name}</span>`;
        }
        addBox.appendChild(row);
      });
    }
    document.getElementById('closeSupportModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
  }

  function showAutoAssignModal(){
    if(planners.length === 0){ alert('등록된 기획자가 없습니다.'); return; }
    const plan = computeAutoAssignPlan();
    const root = document.getElementById('modalRoot');
    if(plan.length === 0){
      root.innerHTML = `
        <div class="modal-backdrop" id="backdrop">
          <div class="modal">
            <h3 style="color:var(--text);">자동 프로젝트 배정</h3>
            <div class="foot-note">배정되지 않은 상태의 프로젝트가 없습니다.</div>
            <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeAutoModal">닫기</button></div>
          </div>
        </div>`;
      document.getElementById('closeAutoModal').onclick = () => root.innerHTML = '';
      document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
      return;
    }
    const okCount = plan.filter(p=>p.ok).length;
    const failCount = plan.length - okCount;
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal" style="max-width:520px;">
          <h3>자동 배정 미리보기</h3>
          <div class="foot-note" style="margin-bottom:10px;">업무량이 적고 일정이 겹치지 않는 적임자를 자동 탐색합니다.</div>
          <div class="stats" style="margin-bottom:10px;">
            <div class="stat ok"><div class="num">${okCount}</div><div class="lbl">배정 가능</div></div>
            <div class="stat ${failCount>0?'warn':'ok'}"><div class="num">${failCount}</div><div class="lbl">배정 불가</div></div>
          </div>
          <div id="autoAssignList" style="max-height:300px; overflow-y:auto;"></div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;">
            <button class="tiny ghost" id="cancelAutoModal">취소</button>
            <button class="tiny primary" id="confirmAutoModal">확정 후 반영</button>
          </div>
        </div>
      </div>`;
    const listBox = document.getElementById('autoAssignList');
    plan.forEach(r => {
      const row = document.createElement('div'); row.style.marginBottom = '6px'; row.style.padding = '8px 10px'; row.style.border = '1px solid var(--border)'; row.style.borderRadius = '7px';
      if(r.ok){
        row.style.background = 'var(--ok-soft)';
        row.innerHTML = `<b>${r.code}</b> → <b>${r.plannerName}</b> <span class="foot-note" style="color:var(--ok);">최적화 완료</span>`;
      } else {
        row.style.background = 'var(--danger-soft)'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between'; row.style.gap = '8px';
        const info = document.createElement('span'); info.innerHTML = `<b>${r.code}</b> <span class="foot-note" style="color:var(--danger);">모든 기획자와 일정 충돌 발생</span>`;
        const manualBtn = document.createElement('button'); manualBtn.className = 'tiny ghost'; manualBtn.textContent = '수동 배정';
        manualBtn.onclick = () => { showAssignPlannerModal(r.code); };
        row.appendChild(info); row.appendChild(manualBtn);
      }
      listBox.appendChild(row);
    });
    document.getElementById('cancelAutoModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
    document.getElementById('confirmAutoModal').onclick = () => {
      plan.filter(r=>r.ok).forEach(r => {
        const pl = planners.find(p=>p.id===r.plannerId);
        if(!pl || planners.some(p2 => p2.projects.includes(r.code))) return;
        pl.projects.push(r.code); autoFillTemplate(pl, r.code);
      });
      savePlanners(); recalcAll(); persist(); rerender();
      root.innerHTML = '';
    };
  }

  function showConflictModal(c){
    const root = document.getElementById('modalRoot');
    const os = c.a.start > c.b.start ? c.a.start : c.b.start;
    const oe = c.a.end < c.b.end ? c.a.end : c.b.end;
    root.innerHTML = `
      <div class="modal-backdrop" id="backdrop">
        <div class="modal">
          <h3 style="color:var(--danger)">⚠ 업무 일정 충돌 발생</h3>
          <div class="line"><b>${c.a.locked?'🔒 ':''}${c.a.name}</b> <span class="range">${fmt(c.a.start)} ~ ${fmt(c.a.end)}</span></div>
          <div class="line"><b>${c.b.locked?'🔒 ':''}${c.b.name}</b> <span class="range">${fmt(c.b.start)} ~ ${fmt(c.b.end)}</span></div>
          <div class="line" style="color:var(--danger); margin-top:10px;">겹치는 중복 기간: <span class="range">${fmt(os)} ~ ${fmt(oe)}</span></div>
          <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="primary" id="closeModal">닫기</button></div>
        </div>
      </div>`;
    document.getElementById('closeModal').onclick = () => root.innerHTML = '';
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') root.innerHTML=''; };
  }

  // ---------------- 프로젝트 뷰 ----------------
  function taskRow(t, conflictIds){
    const tr = document.createElement('tr');
    if(t.locked) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='100%'; nameInput.value=t.name;
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameTd.appendChild(nameInput);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.locked; startInput.style.width='100%'; enablePickerOnClick(startInput);
    startInput.onchange = () => { const d = isoToDate(startInput.value); if(!d) return; t.start = d; t.end = endFromWorkingDays(t.start, t.workingDays); recalcFrom(t); persist(); rerender(); };
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.disabled = t.locked; endInput.style.width='100%'; enablePickerOnClick(endInput);
    endInput.onchange = () => { const d = isoToDate(endInput.value); if(!d) return; t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender(); };
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.textAlign='center';
    const wdWrap = document.createElement('div'); wdWrap.style.display='inline-flex'; wdWrap.style.alignItems='center'; wdWrap.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){ t.workingDays=Math.max(1,v); t.end=endFromWorkingDays(t.start,t.workingDays); recalcFrom(t); persist(); rerender(); }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdWrap.appendChild(minus); wdWrap.appendChild(wdInput); wdWrap.appendChild(plus);
    wdTd.appendChild(wdWrap);

    const pctTd = document.createElement('td'); pctTd.style.textAlign='center';
    const pctInput = document.createElement('input'); pctInput.type='number'; pctInput.value=t.progress; pctInput.min=0; pctInput.max=100;
    pctInput.onchange = () => { t.progress = parseInt(pctInput.value,10)||0; persist(); };
    pctTd.appendChild(pctInput);

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    actTd.appendChild(createRowMenu([
      { label:'+ 아래에 업무 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:t.category, name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt); recalcAll(); persist(); rerender();
      }},
      { label:'업무 삭제', onClick: () => { if(!confirm(`"${t.name}" 업무를 삭제할까요?`)) return; tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender(); } }
    ]));

    [nameTd,startTd,endTd,wdTd,pctTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  function renderConflictPanel(container, conflicts){
    if(conflicts.length===0) return;
    const panel = document.createElement('div'); panel.className = 'panel';
    panel.innerHTML = `<h2>⚠ 일정 중복 안내 (${conflicts.length}건)</h2>`;
    const list = document.createElement('div');
    conflicts.forEach(c => {
      const item = document.createElement('div'); item.className='conflict-item';
      item.innerHTML = `<span>${c.a.locked?'🔒 ':''}${c.a.name} ↔ ${c.b.locked?'🔒 ':''}${c.b.name}</span>`;
      const btn = document.createElement('button'); btn.className='tiny'; btn.textContent='상세보기';
      btn.onclick = () => showConflictModal(c);
      item.appendChild(btn); list.appendChild(item);
    });
    panel.appendChild(list); container.appendChild(panel);
  }

  function renderProjectSidebar(stats){
    const box = document.getElementById('sidebarExtra'); box.innerHTML = '';
    function group(label, list, showDone, toggleShowDone, collapsed, toggleCollapsed){
      if(list.length === 0) return;
      const active = list.filter(s=>!s.done);
      const doneList = list.filter(s=>s.done);
      const lbl = document.createElement('div'); lbl.className = 'sidebar-group-label'; lbl.style.cursor = 'pointer'; lbl.style.display = 'flex'; lbl.style.alignItems = 'center'; lbl.style.gap = '4px';
      lbl.innerHTML = `<span>${collapsed ? '▸' : '▾'}</span><span>${label}</span>`;
      lbl.onclick = () => { toggleCollapsed(); rerender(); };
      box.appendChild(lbl);
      if(collapsed) return;
      const mkItem = (s) => {
        const item = document.createElement('button'); item.className = 'sub-nav-item' + (s.code===selectedProject ? ' active' : '');
        item.innerHTML = `<span>${s.code}</span><span class="pct">${s.avgProgress}%${s.done?' ✅':''}</span>`;
        item.onclick = () => { selectedProject = s.code; rerender(); };
        return item;
      };
      active.forEach(s => box.appendChild(mkItem(s)));
      if(doneList.length > 0){
        const toggle = document.createElement('button'); toggle.className = 'sub-nav-toggle';
        toggle.textContent = (showDone ? '▾' : '▸') + ` 완료됨 (${doneList.length})`;
        toggle.onclick = () => { toggleShowDone(); rerender(); };
        box.appendChild(toggle);
        if(showDone) doneList.forEach(s => box.appendChild(mkItem(s)));
      }
    }
    group('🖥️ PC 프로젝트', stats.filter(s=>s.type==='pc'), showDonePC, ()=>{ showDonePC = !showDonePC; }, collapsePC, ()=>{ collapsePC = !collapsePC; });
    group('📱 모바일 프로젝트', stats.filter(s=>s.type==='mobile'), showDoneMobile, ()=>{ showDoneMobile = !showDoneMobile; }, collapseMobile, ()=>{ collapseMobile = !collapseMobile; });
  }

  function renderProjectView(){
    const main = document.getElementById('main'); main.innerHTML = '';
    const stats = projectStats();
    if(!selectedProject || !stats.find(s=>s.code===selectedProject)){
      selectedProject = stats.length ? stats[0].code : null;
    }
    const inProgress = stats.filter(s=>!s.done).length;
    const done = stats.filter(s=>s.done).length;
    const pcCount = stats.filter(s=>s.type==='pc').length;
    const mobileCount = stats.filter(s=>s.type==='mobile').length;

    const dash = document.createElement('div'); dash.className = 'panel';
    dash.innerHTML = `<div class="stats">
      <div class="stat"><div class="num">${stats.length}</div><div class="lbl">전체 프로젝트</div></div>
      <div class="stat" style="color:inherit;"><div class="num">${inProgress}</div><div class="lbl">진행 중</div></div>
      <div class="stat ok"><div class="num">${done}</div><div class="lbl">완료됨</div></div>
      <div class="stat"><div class="num">🖥️ ${pcCount}</div><div class="lbl">PC 버전</div></div>
      <div class="stat"><div class="num">📱 ${mobileCount}</div><div class="lbl">모바일 버전</div></div>
    </div>`;
    const dashSheetsBtn = document.createElement('button');
    dashSheetsBtn.id = 'dashSheetsBtn'; dashSheetsBtn.className = 'tiny ghost';
    dashSheetsBtn.style.marginTop = '10px'; dashSheetsBtn.textContent = '📊 구글 시트에서 갱신';
    dashSheetsBtn.onclick = () => importFromGoogleSheets('dashSheetsBtn');
    dash.appendChild(dashSheetsBtn);
    main.appendChild(dash);

    if(showPaste){
      const loadPanel = document.createElement('div'); loadPanel.className = 'panel';
      loadPanel.innerHTML = `
        <h2>일정 데이터 붙여넣기</h2>
        <p class="sub">마스터 일정표 또는 복사한 탭 구분 일정 데이터를 연동합니다.</p>
        <textarea id="input" placeholder="스프레드시트 셀 영역을 복사해서 붙여넣으세요"></textarea>
        <div class="row"><button class="primary" id="loadBtn">데이터 추가</button></div>`;
      main.appendChild(loadPanel);
      document.getElementById('loadBtn').onclick = () => {
        const before = new Set(tasks.map(t=>t.project));
        parseAndAppend(document.getElementById('input').value); recalcAll();
        const after = [...new Set(tasks.map(t=>t.project))].find(p=>!before.has(p));
        if(after) selectedProject = after;
        showPaste = false; rerender();
      };
    }

    if(stats.length === 0){
      document.getElementById('sidebarExtra').innerHTML = '';
      const e = document.createElement('div'); e.className='empty'; e.textContent = '등록된 프로젝트가 없습니다. 왼쪽 "+ 붙여넣기로 일정 추가"를 활용하세요.';
      main.appendChild(e); return;
    }

    renderProjectSidebar(stats);

    const sel = stats.find(s=>s.code===selectedProject);
    
    // [버그 수정] 프로젝트 상세 뷰에서도 충돌 상태를 정상 감지하도록 Set 채우기 로직 적용
    const conflicts = computeConflicts();
    const conflictIds = new Set();
    conflicts.forEach(c => { conflictIds.add(c.a.id); conflictIds.add(c.b.id); });

    const wrap = document.createElement('div'); wrap.className='panel';
    const head = document.createElement('div'); head.className='proj-head';
    const assignedPlanners = planners.filter(pl => pl.projects.includes(selectedProject)).map(pl => pl.name);
    const ownerText = ` · 담당 기획자: ${assignedPlanners.length ? assignedPlanners.join(', ') : '미정'}`;
    head.innerHTML = `<span>${sel.type==='mobile'?'📱':'🖥️'} ${selectedProject}</span><span class="foot-note" style="font-weight:400; margin-left:8px;">${sel.type==='mobile'?'모바일':'PC'} · 진척도 ${sel.avgProgress}% · 업무 ${sel.count}개${ownerText}</span>`;
    
    const headActions = document.createElement('div'); headActions.style.marginLeft = 'auto'; headActions.style.display = 'flex'; headActions.style.gap = '6px';
    const doneBtn = document.createElement('button'); doneBtn.className = 'tiny ghost'; doneBtn.textContent = manualCompleted.has(selectedProject) ? '완료 해제' : '완료 처리';
    doneBtn.onclick = () => {
      if(manualCompleted.has(selectedProject)) manualCompleted.delete(selectedProject);
      else manualCompleted.add(selectedProject);
      saveManualCompleted(); rerender();
    };
    const delProjBtn = document.createElement('button'); delProjBtn.className='tiny ghost'; delProjBtn.textContent='삭제';
    delProjBtn.onclick = () => {
      if(confirm(`${selectedProject} 프로젝트를 삭제하시겠습니까?`)){
        tasks = tasks.filter(t=>t.project!==selectedProject); manualCompleted.delete(selectedProject);
        // 이 프로젝트를 담당하고 있던 기획자들의 목록에서도 같이 지워줍니다 (안 지우면 없는 프로젝트 탭이 남아요)
        planners.forEach(pl => { pl.projects = pl.projects.filter(c => c !== selectedProject); });
        savePlanners(); saveManualCompleted(); selectedProject = null; rerender();
      }
    };
    const assignBtn = document.createElement('button'); assignBtn.className = 'tiny'; assignBtn.textContent = '담당자 배정';
    assignBtn.onclick = () => showAssignPlannerModal(selectedProject);
    
    headActions.appendChild(assignBtn); headActions.appendChild(doneBtn); headActions.appendChild(delProjBtn);
    head.appendChild(headActions); wrap.appendChild(head);

    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `<colgroup><col style="width:40%"><col style="width:14%"><col style="width:14%"><col style="width:18%"><col style="width:10%"><col style="width:4%"></colgroup><tr><th>업무명</th><th>시작일</th><th>종료일</th><th>기간(근무일수)</th><th>진행률</th><th></th></tr>`;
    tasks.filter(t=>t.project===selectedProject).forEach(t => table.appendChild(taskRow(t, conflictIds)));
    
    tableWrap.appendChild(table); wrap.appendChild(tableWrap); main.appendChild(wrap);
    renderConflictPanel(main, conflicts.filter(c=>c.project===selectedProject));
  }

  // ---------------- 기획자 뷰 ----------------
  function plannerTaskRow(t, conflictIds, viewerPlannerId){
    const tr = document.createElement('tr');
    if(t.fixed) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';
    const isSupportRow = viewerPlannerId && t.ownerPlanner !== viewerPlannerId;

    const nameTd = document.createElement('td');
    if(t.fixed){
      const lockBadge = document.createElement('span'); lockBadge.textContent = '🔒 '; lockBadge.title = '고정 고립 상태 업무';
      nameTd.appendChild(lockBadge);
    }
    if(isSupportRow){
      const badge = document.createElement('span'); badge.className = 'tag anchor'; badge.textContent = '지원'; badge.style.marginRight = '6px';
      nameTd.appendChild(badge);
    }
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='200px'; nameInput.value=t.name;
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameTd.appendChild(nameInput);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.fixed; startInput.style.width='100%'; enablePickerOnClick(startInput);
    startInput.onchange = () => { const d = isoToDate(startInput.value); if(!d) return; t.start = d; t.end = endFromWorkingDays(t.start, t.workingDays); recalcFrom(t); persist(); rerender(); };
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.style.width='100%'; endInput.disabled = t.fixed; enablePickerOnClick(endInput);
    endInput.onchange = () => { const d = isoToDate(endInput.value); if(!d) return; t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender(); };
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.textAlign='center';
    const wdWrap = document.createElement('div'); wdWrap.style.display='inline-flex'; wdWrap.style.alignItems='center'; wdWrap.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){ t.workingDays=Math.max(1,v); t.end=endFromWorkingDays(t.start,t.workingDays); recalcFrom(t); persist(); rerender(); }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdWrap.appendChild(minus); wdWrap.appendChild(wdInput); wdWrap.appendChild(plus);
    wdTd.appendChild(wdWrap);

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    actTd.appendChild(createRowMenu([
      { label:'+ 아래에 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:'', name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false, ownerPlanner:t.ownerPlanner };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt); recalcAll(); persist(); rerender();
      }},
      { label:'▲ 위로 이동', onClick: () => moveTask(t, -1) },
      { label:'▼ 아래로 이동', onClick: () => moveTask(t, 1) },
      { label:'공동 지원자 설정', onClick: () => showSupportModal(t) },
      { label:'업무 삭제', onClick: () => { if(!confirm(`"${t.name}" 업무를 삭제할까요?`)) return; tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender(); } }
    ]));

    [nameTd,startTd,endTd,wdTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  function renderPlannerSidebar(){
    const box = document.getElementById('sidebarExtra'); box.innerHTML = '';
    if(planners.length === 0) return;
    const lbl = document.createElement('div'); lbl.className='sidebar-group-label'; lbl.textContent = '팀 기획자 명단';
    box.appendChild(lbl);
    planners.forEach(pl => {
      const item = document.createElement('button'); item.className = 'sub-nav-item' + (pl.id===selectedPlanner ? ' active' : '');
      item.innerHTML = `<span>${pl.name}</span><span class="pct">${pl.projects.length}개 담당</span>`;
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
    let netCapacity = 0, overloadCount = 0;
    let cursor = new Date(TODAY);
    while(cursor <= horizonEnd){
      if(!isNonWorking(cursor)){
        const load = allMyTasks.filter(t => t.start <= cursor && cursor <= t.end).length;
        netCapacity += (1 - load); 
        if(load >= 2) overloadCount++;
      }
      cursor = addDays(cursor, 1);
    }

    const panel = document.createElement('div'); panel.className = 'panel';
    panel.innerHTML = `<h2>${pl.name} 기획자 로드밸런싱 가이드</h2>
      <div class="stats" style="margin-bottom:8px;">
        <div class="stat"><div class="num">${allMyTasks.length}</div><div class="lbl">진행 업무 (지원 ${supportTasks.length}건)</div></div>
        <div class="stat ${netCapacity<0?'warn':'ok'}"><div class="num">${netCapacity>0?'+':''}${netCapacity}</div><div class="lbl">60일 내 가동 여유</div></div>
        <div class="stat ${overloadCount>0?'warn':'ok'}"><div class="num">${overloadCount}</div><div class="lbl">업무 병목 일수</div></div>
      </div>`;
    container.appendChild(panel);

    const navRow = document.createElement('div'); navRow.className = 'row'; navRow.style.marginTop = '0'; navRow.style.justifyContent = 'center';
    const prevBtn = document.createElement('button'); prevBtn.className = 'tiny ghost'; prevBtn.textContent = '◀';
    const label = document.createElement('div'); label.style.fontFamily = "var(--font-mono)"; label.style.fontWeight = '700'; label.style.fontSize = '14px'; label.style.minWidth = '90px'; label.style.textAlign = 'center';
    label.textContent = `${plannerCalMonthCursor.getFullYear()}.${String(plannerCalMonthCursor.getMonth()+1).padStart(2,'0')}`;
    const nextBtn = document.createElement('button'); nextBtn.className = 'tiny ghost'; nextBtn.textContent = '▶';
    prevBtn.onclick = () => { plannerCalMonthCursor = new Date(plannerCalMonthCursor.getFullYear(), plannerCalMonthCursor.getMonth()-1, 1); rerender(); };
    nextBtn.onclick = () => { plannerCalMonthCursor = new Date(plannerCalMonthCursor.getFullYear(), plannerCalMonthCursor.getMonth()+1, 1); rerender(); };
    
    navRow.appendChild(prevBtn); navRow.appendChild(label); navRow.appendChild(nextBtn); container.appendChild(navRow);

    const calPanel = document.createElement('div'); calPanel.className = 'panel'; calPanel.style.marginTop = '10px';
    const items = allMyTasks.map(t => {
      const isSupport = t.ownerPlanner !== pl.id;
      return { start: t.start, end: t.end, label: `[${t.project}] ${t.name}${isSupport ? ' (지원)' : ''}`, colorKey: t.project, onClick: () => { selectedPlannerProject = t.project; rerender(); } };
    });
    renderMonthGrid(calPanel, plannerCalMonthCursor, items);
    container.appendChild(calPanel);
  }

  function renderPlannerView(){
    const main = document.getElementById('main'); main.innerHTML = '';
    if(!selectedPlanner || !planners.find(p=>p.id===selectedPlanner)){
      selectedPlanner = planners.length ? planners[0].id : null;
    }
    renderPlannerSidebar();

    if(planners.length === 0){
      const e = document.createElement('div'); e.className='empty'; e.textContent = '팀원을 추가해주세요.';
      main.appendChild(e); return;
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
    const headRow = document.createElement('div'); headRow.style.display = 'flex'; headRow.style.alignItems = 'center'; headRow.style.gap = '10px'; headRow.style.flexWrap = 'wrap';

    const tabsRow = document.createElement('div'); tabsRow.className = 'ptabs'; tabsRow.style.flex = '1';
    pl.projects.forEach(code => {
      const tab = document.createElement('div'); tab.className = 'ptab' + (code===selectedPlannerProject ? ' active' : '');
      const label = document.createElement('span'); label.textContent = code; tab.appendChild(label);
      tab.onclick = () => { selectedPlannerProject = code; rerender(); };
      const del = document.createElement('button'); del.textContent='×';
      del.onclick = (e) => {
        e.stopPropagation();
        if(confirm(`${code} 배정을 해제합니까? 해당 일정 템플릿도 정리됩니다.`)){
          pl.projects = pl.projects.filter(c=>c!==code);
          tasks = tasks.filter(t => !(t.ownerPlanner===pl.id && t.project===code));
          if(selectedPlannerProject === code) selectedPlannerProject = null;
          savePlanners(); recalcAll(); persist(); rerender();
        }
      };
      tab.appendChild(del); tabsRow.appendChild(tab);
    });
    const available = allProjects.filter(p => !pl.projects.includes(p));
    tabsRow.appendChild(createAddProjectButton(available, (code) => {
      const check = checkPlannerAvailability(code, pl);
      if(!check.available){
        const c = check.conflictWith;
        if(!confirm(`⚠ 일정 중복 안내\n\n[${c.project}] 업무와 중복구간이 있습니다. 배정을 강행할까요?`)) return;
      }
      pl.projects.push(code); autoFillTemplate(pl, code); selectedPlannerProject = code;
      savePlanners(); recalcAll(); persist(); rerender();
    }));
    headRow.appendChild(tabsRow);

    const delPlBtn = document.createElement('button'); delPlBtn.className = 'tiny ghost'; delPlBtn.textContent = '기획자 삭제';
    delPlBtn.onclick = () => {
      if(confirm(`${pl.name}님을 명단에서 삭제할까요?`)){
        tasks = tasks.filter(t => t.ownerPlanner !== pl.id);
        // 다른 업무에 이 사람이 지원 인력으로 남아있는 것도 같이 지워줍니다
        tasks.forEach(t => { if(Array.isArray(t.supporters)) t.supporters = t.supporters.filter(id => id !== pl.id); });
        planners = planners.filter(x=>x.id!==pl.id); selectedPlanner = null;
        savePlanners(); recalcAll(); persist(); rerender();
      }
    };
    headRow.appendChild(delPlBtn); block.appendChild(headRow); main.appendChild(block);

    const splitRow = document.createElement('div'); splitRow.style.display = 'flex'; splitRow.style.gap = '16px'; splitRow.style.alignItems = 'flex-start';
    main.appendChild(splitRow);

    const leftCol = document.createElement('div'); leftCol.style.flex = '1.6'; leftCol.style.minWidth = '0';
    const rightCol = document.createElement('div'); rightCol.style.flex = '1'; rightCol.style.minWidth = '0'; rightCol.style.position = 'sticky'; rightCol.style.top = '20px';
    splitRow.appendChild(leftCol); splitRow.appendChild(rightCol);

    renderWorkloadSummary(rightCol, pl);

    const tabsBlock = document.createElement('div'); tabsBlock.className='planner-block';
    if(selectedPlannerProject){
      const code = selectedPlannerProject;
      const anchors = tasks.filter(t => t.project===code && t.locked && !matchesKeyword(t.name)).sort((a,b)=>a.start-b.start);
      const ownTasks = tasks.filter(t => t.project===code && (t.ownerPlanner===pl.id || (Array.isArray(t.supporters) && t.supporters.includes(pl.id))));

      const sub = document.createElement('div');
      const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
      const table = document.createElement('table'); table.style.tableLayout = 'auto';
      table.innerHTML = `<tr><th>단위 업무 내용</th><th>시작 기한</th><th>종료 기한</th><th>근무일수</th><th></th></tr>`;
      ownTasks.forEach(t => table.appendChild(plannerTaskRow(t, conflictIds, pl.id)));
      tableWrap.appendChild(table); sub.appendChild(tableWrap);

      if(ownTasks.length === 0){
        const addTaskBtn = document.createElement('button'); addTaskBtn.className = 'tiny primary'; addTaskBtn.style.marginTop='10px'; addTaskBtn.textContent = `+ 업무 수동 생성`;
        addTaskBtn.onclick = () => {
          const afterAnchor = anchors[0];
          const start = afterAnchor ? nextWorkingDay(afterAnchor.end) : new Date(TODAY);
          const nt = { id:genId(), project:code, category:'', name:'새 기획 업무', start, workingDays:1, progress:0, locked:false, fixed:false, ownerPlanner:pl.id };
          nt.end = endFromWorkingDays(nt.start, nt.workingDays); tasks.push(nt);
          recalcAll(); persist(); rerender();
        };
        sub.appendChild(addTaskBtn);
      }
      tabsBlock.appendChild(sub);
    } else {
      tabsBlock.innerHTML = '<div class="foot-note">담당 배정된 프로젝트가 없습니다.</div>';
    }
    leftCol.appendChild(tabsBlock);
  }

  // ---------------- 월간 매트릭스 그리드 달력 ----------------
  let overviewMonthCursor = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  function renderMonthGrid(container, monthDate, items){
    const year = monthDate.getFullYear(), month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const startWeekday = firstDay.getDay();
    const totalCells = Math.ceil((startWeekday + daysInMonth)/7) * 7;
    const weeksCount = totalCells / 7;

    const wrap = document.createElement('div');
    const head = document.createElement('div'); head.style.display = 'grid'; head.style.gridTemplateColumns = 'repeat(7,1fr)'; head.style.marginBottom = '6px';
    ['일','월','화','수','목','금','토'].forEach((d,i) => {
      const c = document.createElement('div'); c.textContent = d; c.style.textAlign = 'center'; c.style.fontSize = '12px'; c.style.padding = '4px 0'; c.style.fontWeight = '600';
      c.style.color = i===0 ? 'var(--danger)' : (i===6 ? 'var(--anchor)' : 'var(--text-dim)');
      head.appendChild(c);
    });
    wrap.appendChild(head);

    const BAR_H = 18, BAR_GAP = 2, TOP_PAD = 22, BOTTOM_PAD = 14;

    for(let w=0; w<weeksCount; w++){
      const weekStartIdx = w*7;
      const dayNums = [0,1,2,3,4,5,6].map(c => weekStartIdx + c - startWeekday + 1);
      const weekStartDate = new Date(year, month, dayNums[0]);
      const weekEndDate = new Date(year, month, dayNums[6]);

      const weekItems = items.filter(it => it.start <= weekEndDate && it.end >= weekStartDate).sort((a,b)=>a.start-b.start);
      const slotEnds = []; const placements = [];
      weekItems.forEach(it => {
        const segStart = it.start < weekStartDate ? weekStartDate : it.start;
        const segEnd = it.end > weekEndDate ? weekEndDate : it.end;
        const colStart = Math.round((segStart-weekStartDate)/86400000);
        const colSpan = Math.round((segEnd-segStart)/86400000) + 1;
        let slot = slotEnds.findIndex(end => end < segStart);
        if(slot === -1){ slot = slotEnds.length; slotEnds.push(segEnd); } else slotEnds[slot] = segEnd;
        placements.push({ it, slot, colStart, colSpan });
      });
      const slotCount = slotEnds.length;
      const weekHeight = TOP_PAD + Math.max(1, slotCount) * (BAR_H + BAR_GAP) + BOTTOM_PAD;

      const weekWrap = document.createElement('div'); weekWrap.style.position = 'relative'; weekWrap.style.minHeight = weekHeight + 'px'; weekWrap.style.borderBottom = '2px solid var(--border)'; weekWrap.style.marginBottom = '8px';
      const bgRow = document.createElement('div'); bgRow.style.position = 'absolute'; bgRow.style.inset = '0'; bgRow.style.display = 'flex';
      
      dayNums.forEach(dayNum => {
        const cell = document.createElement('div'); cell.style.flex = '1'; cell.style.borderRight = '1px solid var(--text-dim)'; cell.style.padding = '4px'; cell.style.position = 'relative';
        if(dayNum < 1 || dayNum > daysInMonth){
          cell.style.background = 'var(--bg)';
        } else {
          const cellDate = new Date(year, month, dayNum);
          const isToday = sameDay(cellDate, TODAY);
          cell.style.background = isNonWorking(cellDate) ? 'var(--weekend)' : 'var(--panel)';
          const num = document.createElement('div'); num.textContent = dayNum; num.style.fontSize = '11px';
          num.style.color = isToday ? 'var(--accent)' : 'var(--text-dim)'; num.style.fontWeight = isToday ? '700' : '400';
          cell.appendChild(num);
          const numBottom = document.createElement('div'); numBottom.textContent = dayNum;
          numBottom.style.position = 'absolute'; numBottom.style.bottom = '2px'; numBottom.style.left = '4px';
          numBottom.style.fontSize = '10px'; numBottom.style.opacity = '0.55';
          numBottom.style.color = isToday ? 'var(--accent)' : 'var(--text-dim)'; numBottom.style.fontWeight = isToday ? '700' : '400';
          cell.appendChild(numBottom);
        }
        bgRow.appendChild(cell);
      });
      weekWrap.appendChild(bgRow);

      placements.forEach(p => {
        const bar = document.createElement('div'); bar.textContent = p.it.label; bar.title = p.it.label; bar.style.position = 'absolute';
        bar.style.left = (p.colStart/7*100) + '%'; bar.style.width = `calc(${p.colSpan/7*100}% - 2px)`;
        bar.style.top = (TOP_PAD + p.slot*(BAR_H+BAR_GAP)) + 'px'; bar.style.height = BAR_H + 'px';
        bar.style.background = p.it.colorKey ? colorFor(p.it.colorKey) : 'var(--accent)'; bar.style.color = '#ffffff';
        bar.style.borderRadius = '4px'; bar.style.padding = '0 6px'; bar.style.fontSize = '11px'; bar.style.lineHeight = BAR_H+'px'; bar.style.fontWeight = '600';
        bar.style.overflow = 'hidden'; bar.style.textOverflow = 'ellipsis'; bar.style.whiteSpace = 'nowrap';
        if(p.it.onClick) { bar.style.cursor = 'pointer'; bar.onclick = p.it.onClick; }
        weekWrap.appendChild(bar);
      });
      wrap.appendChild(weekWrap);
    }
    container.appendChild(wrap);
  }

  function renderFreePlannerGrid(container, monthDate){
    if(planners.length === 0){ container.innerHTML = '<div class="empty">기획자 명단이 비어있습니다.</div>'; return; }
    const year = monthDate.getFullYear(), month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const startWeekday = firstDay.getDay();
    const totalCells = Math.ceil((startWeekday + daysInMonth)/7) * 7;

    const plannerTasks = new Map();
    planners.forEach(pl => {
      const own = tasks.filter(t => t.ownerPlanner===pl.id);
      const support = tasks.filter(t => t.ownerPlanner!==pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id));
      plannerTasks.set(pl.id, [...own, ...support].filter(t => !matchesKeyword(t.name)));
    });

    const wrap = document.createElement('div');
    const head = document.createElement('div'); head.style.display = 'grid'; head.style.gridTemplateColumns = 'repeat(7,1fr)'; head.style.marginBottom = '6px';
    ['일','월','화','수','목','금','토'].forEach((d,i) => {
      const c = document.createElement('div'); c.textContent = d; c.style.textAlign = 'center'; c.style.fontSize = '12px'; c.style.fontWeight = '600';
      c.style.color = i===0 ? 'var(--danger)' : (i===6 ? 'var(--anchor)' : 'var(--text-dim)'); head.appendChild(c);
    });
    wrap.appendChild(head);

    const grid = document.createElement('div'); grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(7,1fr)'; grid.style.gap = '1px'; grid.style.background = 'var(--border)';

    for(let i=0;i<totalCells;i++){
      const dayNum = i - startWeekday + 1;
      const cell = document.createElement('div'); cell.style.minHeight = '90px'; cell.style.padding = '6px'; cell.style.boxSizing = 'border-box';
      if(dayNum < 1 || dayNum > daysInMonth){
        cell.style.background = 'var(--bg)';
      } else {
        const cellDate = new Date(year, month, dayNum);
        const isToday = sameDay(cellDate, TODAY);
        cell.style.background = isNonWorking(cellDate) ? 'var(--weekend)' : 'var(--panel)';
        const num = document.createElement('div'); num.textContent = dayNum; num.style.fontSize = '11px'; num.style.marginBottom = '4px';
        num.style.color = isToday ? 'var(--accent)' : 'var(--text-dim)'; num.style.fontWeight = isToday ? '700' : '400';
        cell.appendChild(num);

        const freeNames = planners.filter(pl => {
          const list = plannerTasks.get(pl.id); return !list.some(t => t.start <= cellDate && cellDate <= t.end);
        }).map(pl => pl.name);

        if(freeNames.length > 0){
          const tag = document.createElement('div'); tag.textContent = freeNames.join(', '); tag.style.fontSize = '11px';
          tag.style.color = 'var(--ok)'; tag.style.background = 'var(--ok-soft)'; tag.style.borderRadius = '4px'; tag.style.padding = '2px 4px';
          cell.appendChild(tag);
        } else {
          const tag = document.createElement('div'); tag.textContent = '전원 투입'; tag.style.fontSize = '10px'; tag.style.color = 'var(--text-dim)';
          cell.appendChild(tag);
        }
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid); container.appendChild(wrap);
  }

  function renderOverviewView(){
    document.getElementById('sidebarExtra').innerHTML = '';
    const main = document.getElementById('main'); main.innerHTML = '';

    const panel = document.createElement('div'); panel.className = 'panel';
    panel.innerHTML = `<h2>대시보드 월간 캘린더</h2><p class="sub">전체 일정 매트릭스를 모니터링합니다.</p>`;

    const controlRow = document.createElement('div'); controlRow.className = 'row'; controlRow.style.justifyContent = 'space-between';
    const navGroup = document.createElement('div'); navGroup.className = 'row'; navGroup.style.marginTop = '0';
    const prevBtn = document.createElement('button'); prevBtn.className = 'tiny ghost'; prevBtn.textContent = '◀';
    const label = document.createElement('div'); label.style.fontFamily = "var(--font-mono)"; label.style.fontWeight = '700'; label.style.fontSize = '15px'; label.style.minWidth = '90px'; label.style.textAlign = 'center';
    label.textContent = `${overviewMonthCursor.getFullYear()}.${String(overviewMonthCursor.getMonth()+1).padStart(2,'0')}`;
    const nextBtn = document.createElement('button'); nextBtn.className = 'tiny ghost'; nextBtn.textContent = '▶';
    navGroup.appendChild(prevBtn); navGroup.appendChild(label); navGroup.appendChild(nextBtn);

    prevBtn.onclick = () => { overviewMonthCursor = new Date(overviewMonthCursor.getFullYear(), overviewMonthCursor.getMonth()-1, 1); rerender(); };
    nextBtn.onclick = () => { overviewMonthCursor = new Date(overviewMonthCursor.getFullYear(), overviewMonthCursor.getMonth()+1, 1); rerender(); };

    const toggleGroup = document.createElement('div'); toggleGroup.className = 'row'; toggleGroup.style.marginTop = '0';
    const pBtn = document.createElement('button'); pBtn.className = 'tiny ' + (overviewGroupBy==='project' ? 'primary' : 'ghost'); pBtn.textContent = '프로젝트 기준';
    const plBtn = document.createElement('button'); plBtn.className = 'tiny ' + (overviewGroupBy==='planner' ? 'primary' : 'ghost'); plBtn.textContent = '기획자 기준';
    const freeBtn = document.createElement('button'); freeBtn.className = 'tiny ' + (overviewGroupBy==='free' ? 'primary' : 'ghost'); freeBtn.textContent = '가용 자원 조회';
    
    pBtn.onclick = () => { overviewGroupBy = 'project'; rerender(); };
    plBtn.onclick = () => { overviewGroupBy = 'planner'; rerender(); };
    freeBtn.onclick = () => { overviewGroupBy = 'free'; rerender(); };
    
    toggleGroup.appendChild(pBtn); toggleGroup.appendChild(plBtn); toggleGroup.appendChild(freeBtn); controlRow.appendChild(navGroup); controlRow.appendChild(toggleGroup);
    panel.appendChild(controlRow); main.appendChild(panel);

    const calPanel = document.createElement('div'); calPanel.className = 'panel';

    if(overviewGroupBy === 'free'){
      renderFreePlannerGrid(calPanel, overviewMonthCursor); main.appendChild(calPanel); return;
    }

    const items = [];
    if(overviewGroupBy === 'project'){
      projectStats().forEach(s => {
        tasks.filter(t => t.project===s.code && t.locked).forEach(a => {
          items.push({ start: a.start, end: a.end, label: `[${s.code}] ${a.name}`, colorKey: s.code, onClick: () => { view='project'; selectedProject=s.code; syncNavActive(); rerender(); } });
        });
      });
    } else {
      planners.forEach(pl => {
        const own = tasks.filter(t => t.ownerPlanner===pl.id);
        const support = tasks.filter(t => t.ownerPlanner!==pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id));
        [...own, ...support].forEach(t => {
          items.push({ start: t.start, end: t.end, label: `[${pl.name}] ${t.name}`, colorKey: pl.name, onClick: () => { view='planner'; selectedPlanner=pl.id; syncNavActive(); rerender(); } });
        });
      });
    }

    renderMonthGrid(calPanel, overviewMonthCursor, items); main.appendChild(calPanel);
  }

  // ---------------- 마스터 동기화 렌더러 ----------------
  function rerender(){
    if(view === 'project') renderProjectView();
    else if(view === 'planner') renderPlannerView();
    else renderOverviewView();
  }

  function syncNavActive(){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }
