/*
 * render.js — 화면을 그리는 함수들 (프로젝트/기획자/캘린더 뷰, 모달, 행 렌더링)
 */

  // ---------------- PM 변경 알림 토스트 (11-1) ----------------
  function showChangeToast(message){
    const root = document.getElementById('toastRoot');
    if(!root) return;
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<div class="toast-title">📣 변경 알림</div><div>${message}</div>`;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 4500);
  }

  // ---------------- 로그인 상태 표시 (5번, 식별용) ----------------
  function renderLoginStatus(){
    const box = document.getElementById('loginArea');
    if(!box) return;
    box.innerHTML = '';
    if(currentUser){
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '6px';
      if(currentUser.picture){
        const img = document.createElement('img'); img.src = currentUser.picture; img.alt = currentUser.name;
        img.style.width = '22px'; img.style.height = '22px'; img.style.borderRadius = '50%';
        wrap.appendChild(img);
      }
      const name = document.createElement('span'); name.className = 'foot-note'; name.style.margin = '0'; name.textContent = currentUser.name;
      wrap.appendChild(name);
      const logoutBtn = document.createElement('button'); logoutBtn.className = 'tiny ghost'; logoutBtn.textContent = '로그아웃';
      logoutBtn.onclick = () => {
        currentUser = null;
        localStorage.removeItem('scheduleBoardUser');
        if(window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
        renderLoginStatus();
      };
      wrap.appendChild(logoutBtn);
      box.appendChild(wrap);
    } else {
      const btnHolder = document.createElement('div'); btnHolder.id = 'googleLoginBtn';
      box.appendChild(btnHolder);
      if(window.google && google.accounts && google.accounts.id){
        google.accounts.id.renderButton(btnHolder, { theme:'outline', size:'small', text:'signin', type:'standard' });
      }
    }
  }

  // ---------------- 모달 공통 헬퍼 (리팩터링) ----------------
  // 모든 모달이 backdrop+modal 래퍼를 각자 만들고 backdrop 클릭 닫기를 각자
  // 연결하던 걸 한 곳으로 모았습니다. 내부 콘텐츠(bodyHtml)만 넘기면 됩니다.
  function openModal(bodyHtml, maxWidth){
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal"${maxWidth ? ` style="max-width:${maxWidth}px;"` : ''}>${bodyHtml}</div></div>`;
    document.getElementById('backdrop').onclick = (e) => { if(e.target.id==='backdrop') closeModal(); };
    return root;
  }
  function closeModal(){
    const root = document.getElementById('modalRoot');
    if(root) root.innerHTML = '';
  }

  // 가용/충돌 색상이 있는 선택 행 하나 (담당자 배정, 지원 인력, 자동 배정 모달에서 공통 사용).
  // status: 'ok' | 'danger' | 'danger split' 등 CSS 클래스 문자열. onClick 있으면만 클릭 가능하게 처리.
  function createPickRow(innerHtml, status, onClick){
    const row = document.createElement('div');
    row.className = 'pick-row' + (status ? ' ' + status : '');
    row.innerHTML = innerHtml;
    if(onClick){ row.style.cursor = 'pointer'; row.onclick = onClick; }
    return row;
  }

  // 선택 가능한 리스트 한 줄 (선행 업무 후보 목록 등).
  function createListRow(innerHtml, selected, onClick){
    const row = document.createElement('div');
    row.className = 'list-row' + (selected ? ' selected' : '');
    row.innerHTML = innerHtml;
    if(onClick){ row.style.cursor = 'pointer'; row.onclick = onClick; }
    return row;
  }

  // 모달 안 "라벨 + 인풋" 한 블록. 여백은 호출부에서 감싸는 컨테이너에 맞춰 줍니다.
  function fieldBlock(labelText, inputEl){
    const wrap = document.createElement('div');
    const lbl = document.createElement('div'); lbl.className = 'field-label'; lbl.textContent = labelText;
    wrap.appendChild(lbl); wrap.appendChild(inputEl);
    return wrap;
  }

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
    openModal(`
      <h3 style="color:var(--text);">${code} 담당자 지정</h3>
      <div class="foot-note" style="margin-bottom:10px;">기획자별 일정을 파악해 겹치지 않는 팀원만 선택 가능합니다.</div>
      <div id="assignList" style="max-height:340px; overflow-y:auto;"></div>
      <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeAssignModal">닫기</button></div>
    `, 520);
    const listBox = document.getElementById('assignList');
    if(planners.length === 0){
      listBox.innerHTML = '<div class="foot-note">등록된 기획자가 없습니다. 먼저 기획자를 추가해주세요.</div>';
    } else {
      planners.forEach(pl => {
        const alreadyAssigned = pl.projects.includes(code);
        let row;
        if(alreadyAssigned){
          row = createPickRow(`<b>${pl.name}</b> <span class="foot-note">이미 담당 중인 프로젝트입니다 ✅</span>`, 'ok', null);
        } else {
          const check = checkPlannerAvailability(code, pl);
          if(check.available){
            row = createPickRow(`<b>${pl.name}</b> <span class="foot-note" style="color:var(--ok);">배정 가능 — 클릭 시 즉시 지정</span>`, 'ok', () => {
              pl.projects.push(code);
              autoFillTemplate(pl, code);
              savePlanners(); recalcAll(); persist();
              closeModal(); rerender();
            });
          } else {
            const c = check.conflictWith;
            row = createPickRow(`<b>${pl.name}</b> <span class="foot-note" style="color:var(--danger);">일정 중복 — [${c.project}] "${c.name}" (${fmt(c.start)}~${fmt(c.end)})</span>`, 'danger', null);
          }
        }
        listBox.appendChild(row);
      });
    }
    document.getElementById('closeAssignModal').onclick = () => closeModal();
  }

  // ---------------- 선행 업무(dependsOn) 지정 모달 ----------------
  function showDependsOnModal(t){
    let selectedId = t.dependsOn || null;
    let deptFilter = 'all';
    let searchTerm = '';

    openModal(`
      <h3 style="color:var(--text);">선행 업무 지정</h3>
      <div class="foot-note" style="margin-bottom:10px;">대상 업무: <b>${t.name}</b></div>
      <div class="row" id="depDeptTabs" style="margin-top:0; margin-bottom:8px;"></div>
      <input type="text" id="depSearchInput" placeholder="업무명 검색…" style="width:100%; margin-bottom:8px;">
      <div id="depTaskList" style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:6px;"></div>
      <div id="depBufferField" style="margin-top:12px;"></div>
      <div class="foot-note" style="margin-top:10px; color:var(--danger);">⚠ 순환 참조(서로 기다리는 연결)는 저장 시 자동으로 차단됩니다.</div>
      <div class="row" style="justify-content:space-between; margin-top:14px;">
        <button class="tiny ghost" id="depUnlinkBtn" style="color:var(--danger); ${t.dependsOn ? '' : 'visibility:hidden;'}">연결 해제</button>
        <div class="row" style="margin-top:0;">
          <button class="tiny ghost" id="depCancelBtn">취소</button>
          <button class="tiny primary" id="depSaveBtn">저장 및 재계산</button>
        </div>
      </div>
    `, 480);

    const bufferInput = document.createElement('input');
    bufferInput.type = 'number'; bufferInput.id = 'depBufferInput'; bufferInput.value = t.dependsOnBuffer || 0; bufferInput.style.width = '100%';
    document.getElementById('depBufferField').appendChild(fieldBlock('버퍼 일수 (음수 입력 시 겹침 허용, 기본 0 = 다음 영업일)', bufferInput));

    const tabsBox = document.getElementById('depDeptTabs');
    const allTabs = [{ id:'all', label:'전체' }, ...DEPARTMENTS.map(d => ({ id:d.id, label:`${d.icon} ${d.label}` }))];
    function renderTabs(){
      tabsBox.innerHTML = '';
      allTabs.forEach(tab => {
        const b = document.createElement('button'); b.className = 'tiny ' + (deptFilter===tab.id ? 'primary' : 'ghost'); b.textContent = tab.label;
        b.onclick = () => { deptFilter = tab.id; renderTabs(); renderList(); };
        tabsBox.appendChild(b);
      });
    }
    function renderList(){
      const listBox = document.getElementById('depTaskList');
      listBox.innerHTML = '';
      // 같은 프로젝트 안의 다른 부서 업무까지 전부 포함 (locked 앵커도 대상으로 선택 가능 —
      // 예: 영상사 납품일자를 기다리는 업무를 만들 수 있어야 합니다)
      const candidates = tasks.filter(x =>
        x.project === t.project && x.id !== t.id &&
        (deptFilter === 'all' || (x.dept||'plan') === deptFilter) &&
        (!searchTerm || x.name.toLowerCase().includes(searchTerm.toLowerCase()))
      ).sort((a,b) => a.start - b.start);
      if(candidates.length === 0){ listBox.innerHTML = '<div class="foot-note">해당하는 업무가 없습니다.</div>'; return; }
      candidates.forEach(c => {
        const isSelected = selectedId === c.id;
        const row = createListRow(
          `<span style="font-size:13px;"><span class="tag anchor" style="margin-right:6px;">${deptLabel(c.dept||'plan')}</span>${c.name}${c.locked?' 🔒':''}</span><span class="foot-note" style="margin:0;">종료 ${fmt(c.end)}</span>`,
          isSelected,
          () => { selectedId = (selectedId===c.id) ? null : c.id; renderList(); }
        );
        listBox.appendChild(row);
      });
    }
    renderTabs(); renderList();

    document.getElementById('depSearchInput').oninput = (e) => { searchTerm = e.target.value; renderList(); };
    document.getElementById('depUnlinkBtn').onclick = () => {
      t.dependsOn = null; t.dependsOnBuffer = 0;
      recalcAll(); persist(); closeModal(); rerender();
    };
    document.getElementById('depCancelBtn').onclick = () => closeModal();
    document.getElementById('depSaveBtn').onclick = () => {
      if(!selectedId){ alert('선행 업무를 선택해주세요. 연결을 해제하려면 "연결 해제"를 눌러주세요.'); return; }
      if(wouldCreateCycle(t.id, selectedId)){
        alert('이 연결은 순환 구조(서로 기다리는 관계)를 만들어서 지정할 수 없습니다.');
        return;
      }
      t.dependsOn = selectedId;
      t.dependsOnBuffer = parseInt(document.getElementById('depBufferInput').value, 10) || 0;
      recalcAll(); persist(); closeModal(); rerender();
    };
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
  
  // ---------------- 캘린더 Quick Edit 팝업 ----------------
  // 종합 캘린더 매트릭스 / 기획자 60일 캘린더 등, 달력 막대를 클릭했을 때 뜨는 공용 팝업.
  // locked(마스터 앵커)나 fixed(고정 업무)는 여기서 날짜를 못 바꾸게 하고(해당 화면의
  // 전용 입력칸에서만 수정), 나머지는 이름/날짜를 바로 고칠 수 있습니다.
  function showCalendarQuickEdit(t, navigateFn){
    const readOnly = !!(t.locked || t.fixed);
    openModal(`
      <h3 style="color:var(--text);">✎ 일정 빠른 수정</h3>
      <div class="foot-note" style="margin-bottom:8px;">[${t.project}] ${readOnly ? '🔒 고정 일정 (여기서는 날짜 수정 불가)' : deptLabel(t.dept||'plan')}</div>
      <div id="qeNameField" style="margin-bottom:10px;"></div>
      <div class="row" style="margin-top:0;">
        <div id="qeStartField" style="flex:1;"></div>
        <div id="qeEndField" style="flex:1;"></div>
      </div>
      <div id="qeHint" class="foot-note" style="margin-top:8px;"></div>
      <div class="row" style="justify-content:space-between; margin-top:14px;">
        <button class="tiny ghost" id="qeGotoBtn">${navigateFn ? '해당 화면으로 이동' : ''}</button>
        <div class="row" style="margin-top:0;">
          <button class="tiny ghost" id="qeCancelBtn">취소</button>
          ${readOnly ? '' : '<button class="tiny primary" id="qeSaveBtn">변경 적용</button>'}
        </div>
      </div>
    `, 400);

    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.id='qeName'; nameInput.value=t.name; nameInput.style.width='100%'; nameInput.disabled = readOnly;
    document.getElementById('qeNameField').appendChild(fieldBlock('업무명', nameInput));
    const startInput = document.createElement('input'); startInput.type='date'; startInput.id='qeStart'; startInput.value=dateToIso(t.start); startInput.style.width='100%'; startInput.disabled = readOnly;
    document.getElementById('qeStartField').appendChild(fieldBlock('시작일', startInput));
    const endInput = document.createElement('input'); endInput.type='date'; endInput.id='qeEnd'; endInput.value=dateToIso(t.end); endInput.style.width='100%'; endInput.disabled = readOnly;
    document.getElementById('qeEndField').appendChild(fieldBlock('종료일', endInput));

    const hintBox = document.getElementById('qeHint');
    const depInfo = dependsOnLowerBound(t);
    if(depInfo) hintBox.textContent = `선행 업무 "${depInfo.dep.name}" 하한선 자동 검증됨 (${fmt(depInfo.lowerBound)} 이후)`;
    else if(readOnly) hintBox.textContent = '고정 일정이라 여기서는 이름/날짜를 바로 바꿀 수 없습니다.';

    const gotoBtn = document.getElementById('qeGotoBtn');
    if(navigateFn) gotoBtn.onclick = () => { closeModal(); navigateFn(); };
    else gotoBtn.style.visibility = 'hidden';
    document.getElementById('qeCancelBtn').onclick = () => closeModal();

    if(!readOnly){
      document.getElementById('qeSaveBtn').onclick = () => {
        const newName = document.getElementById('qeName').value.trim();
        const newStart = isoToDate(document.getElementById('qeStart').value);
        const newEnd = isoToDate(document.getElementById('qeEnd').value);
        if(!newStart || !newEnd || newEnd < newStart){ alert('날짜를 다시 확인해주세요.'); return; }
        const conflict = findFixedAnchorOverlap(t, newStart, newEnd);
        if(conflict){
          alert(`이 날짜로 수정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
          return;
        }
        const depViol = dependsOnViolation(t, newStart);
        if(depViol){
          alert(`이 날짜로 수정할 수 없습니다.\n이유: 선행 업무 "${depViol.dep.name}" 기준 ${fmt(depViol.lowerBound)} 이후여야 합니다.`);
          return;
        }
        t.name = newName || t.name;
        t.start = newStart; t.end = newEnd; t.workingDays = workingDaysBetween(newStart, newEnd);
        recalcFrom(t); applyDependsOnConstraints(); persist();
        closeModal(); rerender();
      };
    }
  }

  function showSupportModal(t){
    if(!t.supporters) t.supporters = [];
    const mainOwner = planners.find(p => p.id === t.ownerPlanner);
    const current = planners.filter(p => t.supporters.includes(p.id));
    const available = planners.filter(p => p.id !== t.ownerPlanner && !t.supporters.includes(p.id));
    openModal(`
      <h3 style="color:var(--text);">지원 기획자 설정</h3>
      <div class="foot-note" style="margin-bottom:8px;">"${t.name}" 업무의 메인 담당자는 <b>${mainOwner?mainOwner.name:'미정'}</b>님입니다. 업무 지원 인력만 설정합니다.</div>
      <div id="currentSupportList" style="margin-bottom:10px;"></div>
      <div class="foot-note" style="margin-bottom:6px;">+ 지원 인력 배정</div>
      <div id="addSupportList" style="max-height:220px; overflow-y:auto;"></div>
      <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeSupportModal">닫기</button></div>
    `);
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
          closeModal();
        };
        chip.appendChild(del); currentBox.appendChild(chip);
      });
    }
    const addBox = document.getElementById('addSupportList');
    if(available.length === 0){
      addBox.innerHTML = '<div class="foot-note">지정 가능한 다른 기획자가 없습니다.</div>';
    } else {
      available.forEach(p => {
        let conflict = null;
        if(!matchesKeyword(t.name)){
          const existing = tasks.filter(t2 => (t2.ownerPlanner===p.id || (Array.isArray(t2.supporters) && t2.supporters.includes(p.id))) && t2.id !== t.id && !matchesKeyword(t2.name));
          for(const ex of existing){
            if(t.start <= ex.end && ex.start <= t.end){ conflict = { conflictWith: ex }; break; }
          }
        }
        let row;
        if(!conflict){
          row = createPickRow(`<b>${p.name}</b> <span class="foot-note" style="color:var(--ok);">배정 가능</span>`, 'ok', () => {
            t.supporters.push(p.id);
            if(!p.projects.includes(t.project)) p.projects.push(t.project);
            savePlanners(); recalcAll(); persist(); rerender();
            closeModal();
          });
        } else {
          const c = conflict.conflictWith;
          row = createPickRow(`<b>${p.name}</b> <span class="foot-note" style="color:var(--danger);">중복 — [${c.project}] ${c.name}</span>`, 'danger', null);
        }
        addBox.appendChild(row);
      });
    }
    document.getElementById('closeSupportModal').onclick = () => closeModal();
  }

  function showSheetsImportResultModal(report){
    const conflictRows = [];
    report.conflictReport.forEach(entry => {
      entry.conflicts.forEach(c => {
        conflictRows.push({ plannerName: entry.plannerName, a: c.a, b: c.b });
      });
    });
    openModal(`
      <h3 style="color:var(--text);">구글 시트 갱신 완료</h3>
      <div class="stats" style="margin-bottom:10px;">
        <div class="stat"><div class="num">${report.projectCount}</div><div class="lbl">갱신된 프로젝트</div></div>
        <div class="stat"><div class="num">${report.plannerCount}</div><div class="lbl">재동기화된 기획자</div></div>
        <div class="stat ${conflictRows.length>0?'warn':'ok'}"><div class="num">${conflictRows.length}</div><div class="lbl">남은 겹침</div></div>
      </div>
      <div class="foot-note" style="margin-bottom:8px;">마스터 앵커를 최신 날짜로 교체했고, 이 프로젝트를 담당/지원하던 기획자들의 고정 업무(${report.resyncUpdated}건 갱신, ${report.resyncAdded}건 신규)도 같이 맞췄습니다.</div>
      <div id="importConflictList"></div>
      <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny primary" id="closeImportModal">확인</button></div>
    `, 560);
    const listBox = document.getElementById('importConflictList');
    if(conflictRows.length === 0){
      const ok = document.createElement('div'); ok.className = 'foot-note'; ok.style.color = 'var(--ok)';
      ok.textContent = '날짜 겹침 없이 전부 정상적으로 맞춰졌습니다.';
      listBox.appendChild(ok);
    } else {
      const title = document.createElement('div'); title.className = 'foot-note'; title.style.marginBottom = '6px';
      title.textContent = '아래 업무들은 앵커 날짜가 바뀌면서 서로 겹치게 됐어요. 직접 확인해서 조정해주세요:';
      listBox.appendChild(title);
      conflictRows.forEach(c => {
        const row = document.createElement('div'); row.className = 'conflict-item';
        row.innerHTML = `<span><b>${c.plannerName}</b> — [${c.a.project}] "${c.a.name}" (${fmt(c.a.start)}~${fmt(c.a.end)}) ↔ [${c.b.project}] "${c.b.name}" (${fmt(c.b.start)}~${fmt(c.b.end)})</span>`;
        listBox.appendChild(row);
      });
    }
    document.getElementById('closeImportModal').onclick = () => closeModal();
  }

  function showAddTeamMemberModal(){
    openModal(`
      <h3 style="color:var(--text);">팀원 추가</h3>
      <div class="foot-note" style="margin-bottom:10px;">이름과 소속 부서를 선택하세요.</div>
      <input type="text" id="newMemberName" placeholder="이름" style="width:100%; margin-bottom:12px;">
      <div class="foot-note" style="margin-bottom:6px;">부서</div>
      <div class="row" id="deptChoices" style="margin-top:0;"></div>
      <div class="row" style="justify-content:flex-end; margin-top:16px;">
        <button class="tiny ghost" id="cancelAddMember">취소</button>
        <button class="tiny primary" id="confirmAddMember" disabled>추가</button>
      </div>
    `, 420);
    let selectedDept = null;
    const choicesBox = document.getElementById('deptChoices');
    const confirmBtn = document.getElementById('confirmAddMember');
    DEPARTMENTS.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'tiny ghost'; btn.textContent = `${d.icon} ${d.label}`;
      btn.onclick = () => {
        selectedDept = d.id;
        choicesBox.querySelectorAll('button').forEach(b => b.className = 'tiny ghost');
        btn.className = 'tiny primary';
        confirmBtn.disabled = false;
      };
      choicesBox.appendChild(btn);
    });
    document.getElementById('cancelAddMember').onclick = () => closeModal();
    confirmBtn.onclick = () => {
      const name = document.getElementById('newMemberName').value.trim();
      if(!name){ alert('이름을 입력해주세요.'); return; }
      if(!selectedDept){ alert('부서를 선택해주세요.'); return; }
      const pl = { id: genId(), name, dept: selectedDept, projects: [] };
      planners.push(pl);
      savePlanners(); view = 'planner'; selectedPlanner = pl.id; syncNavActive();
      closeModal(); rerender();
    };
  }

  function showAutoAssignModal(){
    if(planners.length === 0){ alert('등록된 기획자가 없습니다.'); return; }
    const plan = computeAutoAssignPlan();
    if(plan.length === 0){
      openModal(`
        <h3 style="color:var(--text);">자동 프로젝트 배정</h3>
        <div class="foot-note">배정되지 않은 상태의 프로젝트가 없습니다.</div>
        <div class="row" style="justify-content:flex-end; margin-top:14px;"><button class="tiny ghost" id="closeAutoModal">닫기</button></div>
      `);
      document.getElementById('closeAutoModal').onclick = () => closeModal();
      return;
    }
    const okCount = plan.filter(p=>p.ok).length;
    const failCount = plan.length - okCount;
    openModal(`
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
    `, 520);
    const listBox = document.getElementById('autoAssignList');
    plan.forEach(r => {
      let row;
      if(r.ok){
        row = createPickRow(`<b>${r.code}</b> → <b>${r.plannerName}</b> <span class="foot-note" style="color:var(--ok);">최적화 완료</span>`, 'ok', null);
      } else {
        row = createPickRow('', 'danger split', null);
        const info = document.createElement('span'); info.innerHTML = `<b>${r.code}</b> <span class="foot-note" style="color:var(--danger);">모든 기획자와 일정 충돌 발생</span>`;
        const manualBtn = document.createElement('button'); manualBtn.className = 'tiny ghost'; manualBtn.textContent = '수동 배정';
        manualBtn.onclick = () => { closeModal(); showAssignPlannerModal(r.code); };
        row.appendChild(info); row.appendChild(manualBtn);
      }
      listBox.appendChild(row);
    });
    document.getElementById('cancelAutoModal').onclick = () => closeModal();
    document.getElementById('confirmAutoModal').onclick = () => {
      plan.filter(r=>r.ok).forEach(r => {
        const pl = planners.find(p=>p.id===r.plannerId);
        if(!pl || planners.some(p2 => p2.projects.includes(r.code))) return;
        pl.projects.push(r.code); autoFillTemplate(pl, r.code);
      });
      savePlanners(); recalcAll(); persist(); rerender();
      closeModal();
    };
  }

  // ---------------- 프로젝트 뷰 ----------------
  function conflictReasonText(partners){
    return partners.map(p => `[${p.project}] "${p.name}" (${fmt(p.start)}~${fmt(p.end)})`).join(', ');
  }

  function memoIcon(t){
    const icon = document.createElement('span');
    icon.textContent = '📝';
    icon.style.fontSize = '12px'; icon.style.cursor = 'pointer'; icon.style.flexShrink = '0';
    icon.style.opacity = t.memo ? '1' : '0.3';
    icon.title = t.memo ? ('메모: ' + t.memo + ' (클릭해서 수정)') : '메모 추가 (클릭)';
    icon.onclick = (e) => {
      e.stopPropagation();
      const v = prompt('메모를 입력하세요 (비워두면 삭제):', t.memo || '');
      if(v === null) return;
      t.memo = v.trim(); persist(); rerender();
    };
    return icon;
  }

  function taskRow(t, conflictIds, conflictMap){
    const tr = document.createElement('tr');
    if(t.locked) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';
    if(isDelayed(t)) tr.className += ' delayed';

    const nameTd = document.createElement('td');
    const nameWrap = document.createElement('div'); nameWrap.style.display = 'inline-flex'; nameWrap.style.alignItems = 'center'; nameWrap.style.gap = '6px'; nameWrap.style.width = '100%';
    if(conflictMap && conflictMap.has(t.id)){
      const warnIcon = document.createElement('span'); warnIcon.textContent = '!';
      warnIcon.title = '겹침: ' + conflictReasonText(conflictMap.get(t.id));
      warnIcon.style.display = 'inline-flex'; warnIcon.style.alignItems = 'center'; warnIcon.style.justifyContent = 'center';
      warnIcon.style.width = '16px'; warnIcon.style.height = '16px'; warnIcon.style.borderRadius = '50%';
      warnIcon.style.background = 'var(--danger)'; warnIcon.style.color = '#fff'; warnIcon.style.fontSize = '11px'; warnIcon.style.fontWeight = '700';
      warnIcon.style.cursor = 'help'; warnIcon.style.flexShrink = '0';
      nameWrap.appendChild(warnIcon);
    }
    if(isDelayed(t)){
      const delayIcon = document.createElement('span'); delayIcon.textContent = '⏰';
      delayIcon.title = `종료일(${fmt(t.end)})이 지났는데 아직 완료 처리되지 않았습니다.`;
      delayIcon.style.fontSize = '12px'; delayIcon.style.cursor = 'help'; delayIcon.style.flexShrink = '0';
      nameWrap.appendChild(delayIcon);
    }
    nameWrap.appendChild(memoIcon(t));
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='100%'; nameInput.value=t.name;
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameWrap.appendChild(nameInput);
    nameTd.appendChild(nameWrap);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.locked; startInput.style.width='100%'; enablePickerOnClick(startInput);
    startInput.onchange = () => {
      const d = isoToDate(startInput.value); if(!d) return;
      const newEnd = endFromWorkingDays(d, t.workingDays);
      const conflict = findFixedAnchorOverlap(t, d, newEnd);
      if(conflict){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        startInput.value = dateToIso(t.start);
        return;
      }
      const depViol = dependsOnViolation(t, d);
      if(depViol){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 선행 업무 "${depViol.dep.name}" 기준 ${fmt(depViol.lowerBound)} 이후여야 합니다.`);
        startInput.value = dateToIso(t.start);
        return;
      }
      t.start = d; t.end = newEnd; recalcFrom(t); applyDependsOnConstraints(); persist(); rerender();
    };
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.disabled = t.locked; endInput.style.width='100%'; enablePickerOnClick(endInput);
    endInput.onchange = () => {
      const d = isoToDate(endInput.value); if(!d) return;
      const conflict = findFixedAnchorOverlap(t, t.start, d);
      if(conflict){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        endInput.value = dateToIso(t.end);
        return;
      }
      t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender();
    };
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.textAlign='center';
    const wdWrap = document.createElement('div'); wdWrap.style.display='inline-flex'; wdWrap.style.alignItems='center'; wdWrap.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){
      const newWd = Math.max(1,v);
      const newEnd = endFromWorkingDays(t.start, newWd);
      const conflict = findFixedAnchorOverlap(t, t.start, newEnd);
      if(conflict){
        alert(`이 기간으로 조정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        return;
      }
      t.workingDays = newWd; t.end = newEnd; recalcFrom(t); persist(); rerender();
    }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdWrap.appendChild(minus); wdWrap.appendChild(wdInput); wdWrap.appendChild(plus);
    wdTd.appendChild(wdWrap);

    const pctTd = document.createElement('td'); pctTd.style.textAlign='center';
    const pctInput = document.createElement('input'); pctInput.type='number'; pctInput.value=t.progress; pctInput.min=0; pctInput.max=100;
    pctInput.onchange = () => { t.progress = parseInt(pctInput.value,10)||0; persist(); };
    pctTd.appendChild(pctInput);

    const doneTd = document.createElement('td'); doneTd.style.textAlign='center';
    const doneCb = document.createElement('input'); doneCb.type='checkbox'; doneCb.checked = !!t.done; doneCb.disabled = t.locked;
    doneCb.title = t.done && t.doneBy ? `완료 처리: ${t.doneBy}` : '완료 처리';
    doneCb.onchange = () => { markTaskDone(t, doneCb.checked); persist(); rerender(); };
    doneTd.appendChild(doneCb);

    const depTd = document.createElement('td'); depTd.style.textAlign='center';
    depTd.appendChild(dependsOnCell(t));

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    const rowActions = [
      { label:'+ 아래에 업무 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:t.category, name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false, done:false, memo:'' };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt); recalcAll(); persist(); rerender();
      }}
    ];
    if(!t.locked) rowActions.push({ label:'선행 업무 지정', onClick: () => showDependsOnModal(t) });
    rowActions.push({ label:'업무 삭제', onClick: () => {
      if(!confirm(`"${t.name}" 업무를 삭제할까요?`)) return;
      releaseDependsOnRefs([t.id]);
      tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender();
    }});
    actTd.appendChild(createRowMenu(rowActions));

    [nameTd,startTd,endTd,wdTd,pctTd,doneTd,depTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  // 선행 업무 열에 쓰는 셀. 지정돼 있으면 부서 뱃지 + 이름을 보여주고 클릭하면
  // 바로 모달이 열립니다. locked 업무는 선행 업무를 지정할 수 없으므로 "-"만 표시합니다.
  function dependsOnCell(t){
    if(t.locked){ const span = document.createElement('span'); span.className='foot-note'; span.textContent='-'; return span; }
    const dep = t.dependsOn ? getTaskById(t.dependsOn) : null;
    const btn = document.createElement('button'); btn.className = 'tiny ghost';
    btn.style.maxWidth = '100%'; btn.style.overflow = 'hidden'; btn.style.textOverflow = 'ellipsis'; btn.style.whiteSpace = 'nowrap';
    if(dep){
      btn.innerHTML = `<span class="tag anchor" style="margin-right:4px;">${deptLabel(dep.dept||'plan')}</span>${dep.name}`;
    } else {
      btn.textContent = '지정 안 됨';
      btn.style.color = 'var(--text-dim)';
    }
    btn.onclick = () => showDependsOnModal(t);
    return btn;
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
    
    // 마스터 일정(프로젝트별 일정)에서는 타코-글비/영상/제작실 같은 여러 트랙이
    // 원래 같은 기간에 동시에 진행되는 게 정상이라, 겹침 경고를 표시하지 않습니다.
    const conflictIds = new Set();
    const conflictMap = new Map();

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
        releaseDependsOnRefs(tasks.filter(t=>t.project===selectedProject).map(t=>t.id));
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

    // ---------------- 영상사 일정 (촬영일자 / 납품일자) ----------------
    // PM이 영상사에서 받은 날짜를 그냥 입력하는 칸입니다. 입력하는 순간 이 프로젝트의
    // "고정 앵커" 업무로 등록되어, 다른 업무 배치·겹침 감지에 그대로 반영됩니다.
    const videoRow = document.createElement('div');
    videoRow.style.display = 'flex'; videoRow.style.gap = '18px'; videoRow.style.alignItems = 'center'; videoRow.style.flexWrap = 'wrap';
    videoRow.style.marginTop = '10px'; videoRow.style.paddingTop = '10px'; videoRow.style.borderTop = '1px solid var(--border)';

    function videoDateField(label, anchorName){
      const fieldWrap = document.createElement('div'); fieldWrap.style.display = 'flex'; fieldWrap.style.alignItems = 'center'; fieldWrap.style.gap = '6px';
      const lbl = document.createElement('span'); lbl.className = 'foot-note'; lbl.style.margin = '0'; lbl.textContent = '🎬 ' + label + ':';
      const existing = tasks.find(t => t.project===selectedProject && t.category==='영상사' && t.name===anchorName);
      const input = document.createElement('input'); input.type = 'date'; input.style.width = '150px';
      if(existing) input.value = dateToIso(existing.start);
      enablePickerOnClick(input);
      input.onchange = () => {
        const d = isoToDate(input.value); if(!d) return;
        let t = tasks.find(x => x.project===selectedProject && x.category==='영상사' && x.name===anchorName);
        if(t){ t.start = d; t.end = new Date(d); t.workingDays = 1; }
        else {
          tasks.push({
            id: genId(), project: selectedProject, category: '영상사', name: anchorName,
            start: d, end: new Date(d), workingDays: 1, progress: 100,
            locked: true, fixed: false, done: false, memo: '', dept: 'plan'
          });
        }
        recalcAll(); persist(); rerender();
      };
      fieldWrap.appendChild(lbl); fieldWrap.appendChild(input);
      return fieldWrap;
    }

    videoRow.appendChild(videoDateField('촬영일자', '영상사 촬영일자'));
    videoRow.appendChild(videoDateField('납품일자', '영상사 납품일자'));
    wrap.appendChild(videoRow);

    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = `<colgroup><col style="width:29%"><col style="width:11%"><col style="width:11%"><col style="width:14%"><col style="width:8%"><col style="width:7%"><col style="width:16%"><col style="width:4%"></colgroup><tr><th>업무명</th><th>시작일</th><th>종료일</th><th>기간(근무일수)</th><th>진행률</th><th style="text-align:center;">완료</th><th>선행 업무</th><th></th></tr>`;
    tasks.filter(t=>t.project===selectedProject).forEach(t => table.appendChild(taskRow(t, conflictIds, conflictMap)));
    
    tableWrap.appendChild(table); wrap.appendChild(tableWrap); main.appendChild(wrap);
  }

  // ---------------- 기획자 뷰 ----------------
  function plannerTaskRow(t, conflictIds, viewerPlannerId, conflictMap){
    const tr = document.createElement('tr');
    if(t.fixed) tr.className = 'locked';
    if(conflictIds.has(t.id)) tr.className += ' conflict';
    if(isDelayed(t)) tr.className += ' delayed';
    const isSupportRow = viewerPlannerId && t.ownerPlanner !== viewerPlannerId;

    const nameTd = document.createElement('td');
    if(conflictMap && conflictMap.has(t.id)){
      const warnIcon = document.createElement('span'); warnIcon.textContent = '!';
      warnIcon.title = '겹침: ' + conflictReasonText(conflictMap.get(t.id));
      warnIcon.style.display = 'inline-flex'; warnIcon.style.alignItems = 'center'; warnIcon.style.justifyContent = 'center';
      warnIcon.style.width = '16px'; warnIcon.style.height = '16px'; warnIcon.style.borderRadius = '50%';
      warnIcon.style.background = 'var(--danger)'; warnIcon.style.color = '#fff'; warnIcon.style.fontSize = '11px'; warnIcon.style.fontWeight = '700';
      warnIcon.style.cursor = 'help'; warnIcon.style.marginRight = '6px'; warnIcon.style.verticalAlign = 'middle';
      nameTd.appendChild(warnIcon);
    }
    if(isDelayed(t)){
      const delayIcon = document.createElement('span'); delayIcon.textContent = '⏰';
      delayIcon.title = `종료일(${fmt(t.end)})이 지났는데 아직 완료 처리되지 않았습니다.`;
      delayIcon.style.fontSize = '12px'; delayIcon.style.cursor = 'help'; delayIcon.style.marginRight = '6px';
      nameTd.appendChild(delayIcon);
    }
    if(t.fixed){
      const lockBadge = document.createElement('span'); lockBadge.textContent = '🔒 '; lockBadge.title = '고정 고립 상태 업무';
      nameTd.appendChild(lockBadge);
    }
    if(isSupportRow){
      const badge = document.createElement('span'); badge.className = 'tag anchor'; badge.textContent = '지원'; badge.style.marginRight = '6px';
      nameTd.appendChild(badge);
    }
    nameTd.appendChild(memoIcon(t));
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.style.width='200px'; nameInput.value=t.name;
    nameInput.onchange = () => { t.name = nameInput.value; persist(); };
    nameTd.appendChild(nameInput);

    const startTd = document.createElement('td'); startTd.style.textAlign='center';
    const startInput = document.createElement('input'); startInput.type='date'; startInput.value=dateToIso(t.start); startInput.disabled = t.fixed; startInput.style.width='100%'; enablePickerOnClick(startInput);
    startInput.onchange = () => {
      const d = isoToDate(startInput.value); if(!d) return;
      const newEnd = endFromWorkingDays(d, t.workingDays);
      const conflict = findFixedAnchorOverlap(t, d, newEnd);
      if(conflict){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        startInput.value = dateToIso(t.start);
        return;
      }
      const depViol = dependsOnViolation(t, d);
      if(depViol){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 선행 업무 "${depViol.dep.name}" 기준 ${fmt(depViol.lowerBound)} 이후여야 합니다.`);
        startInput.value = dateToIso(t.start);
        return;
      }
      t.start = d; t.end = newEnd; recalcFrom(t); applyDependsOnConstraints(); persist(); rerender();
    };
    startTd.appendChild(startInput);

    const endTd = document.createElement('td'); endTd.style.textAlign='center';
    const endInput = document.createElement('input'); endInput.type='date'; endInput.value=dateToIso(t.end); endInput.style.width='100%'; endInput.disabled = t.fixed; enablePickerOnClick(endInput);
    endInput.onchange = () => {
      const d = isoToDate(endInput.value); if(!d) return;
      const conflict = findFixedAnchorOverlap(t, t.start, d);
      if(conflict){
        alert(`이 날짜로 수정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        endInput.value = dateToIso(t.end);
        return;
      }
      t.end = d; t.workingDays = workingDaysBetween(t.start,t.end); recalcFrom(t); persist(); rerender();
    };
    endTd.appendChild(endInput);

    const wdTd = document.createElement('td'); wdTd.style.whiteSpace='nowrap'; wdTd.style.textAlign='center';
    const wdWrap = document.createElement('div'); wdWrap.style.display='inline-flex'; wdWrap.style.alignItems='center'; wdWrap.style.gap='5px';
    const minus = document.createElement('button'); minus.className='tiny ghost'; minus.textContent='−';
    const wdInput = document.createElement('input'); wdInput.type='number'; wdInput.value=t.workingDays; wdInput.min=1;
    const plus = document.createElement('button'); plus.className='tiny ghost'; plus.textContent='+';
    function applyWd(v){
      const newWd = Math.max(1,v);
      const newEnd = endFromWorkingDays(t.start, newWd);
      const conflict = findFixedAnchorOverlap(t, t.start, newEnd);
      if(conflict){
        alert(`이 기간으로 조정할 수 없습니다.\n이유: 고정 일정 "${conflict.name}" (${fmt(conflict.start)}~${fmt(conflict.end)})과 겹칩니다.`);
        return;
      }
      t.workingDays = newWd; t.end = newEnd; recalcFrom(t); persist(); rerender();
    }
    minus.onclick=()=>applyWd(t.workingDays-1); plus.onclick=()=>applyWd(t.workingDays+1);
    wdInput.onchange=()=>applyWd(parseInt(wdInput.value,10)||1);
    wdWrap.appendChild(minus); wdWrap.appendChild(wdInput); wdWrap.appendChild(plus);
    wdTd.appendChild(wdWrap);

    const doneTd = document.createElement('td'); doneTd.style.textAlign='center';
    const doneCb = document.createElement('input'); doneCb.type='checkbox'; doneCb.checked = !!t.done;
    doneCb.title = t.done && t.doneBy ? `완료 처리: ${t.doneBy}` : '완료 처리';
    doneCb.onchange = () => { markTaskDone(t, doneCb.checked); persist(); rerender(); };
    doneTd.appendChild(doneCb);

    const depTd = document.createElement('td'); depTd.style.textAlign='center';
    depTd.appendChild(dependsOnCell(t));

    const actTd = document.createElement('td'); actTd.style.textAlign='center';
    actTd.appendChild(createRowMenu([
      { label:'+ 아래에 추가', onClick: () => {
        const idx = tasks.indexOf(t);
        const nt = { id:genId(), project:t.project, category:'', name:'새 업무', start:nextWorkingDay(t.end), workingDays:1, progress:0, locked:false, fixed:false, done:false, memo:'', dept:t.dept||'plan', ownerPlanner:t.ownerPlanner };
        nt.end = endFromWorkingDays(nt.start, nt.workingDays);
        tasks.splice(idx+1,0,nt); recalcAll(); persist(); rerender();
      }},
      { label:'▲ 위로 이동', onClick: () => moveTask(t, -1) },
      { label:'▼ 아래로 이동', onClick: () => moveTask(t, 1) },
      { label:'공동 지원자 설정', onClick: () => showSupportModal(t) },
      { label:'선행 업무 지정', onClick: () => showDependsOnModal(t) },
      { label:'업무 삭제', onClick: () => {
        if(!confirm(`"${t.name}" 업무를 삭제할까요?`)) return;
        releaseDependsOnRefs([t.id]);
        tasks = tasks.filter(x=>x.id!==t.id); recalcAll(); persist(); rerender();
      }}
    ]));

    [nameTd,startTd,endTd,wdTd,doneTd,depTd,actTd].forEach(td=>tr.appendChild(td));
    return tr;
  }

  // 소속 부서 대시보드 상단 탭 — 기획/UI/개발 GNB 전환. 탭을 바꾸면 사이드바가
  // 그 부서 인원만 보여주고, 선택된 사람이 다른 부서면 그 부서 첫 인원으로 넘어갑니다.
  function renderDeptTabs(container){
    const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.marginTop = '0'; wrap.style.marginBottom = '14px';
    DEPARTMENTS.forEach(dept => {
      const count = planners.filter(pl => (pl.dept||'plan') === dept.id).length;
      const b = document.createElement('button');
      b.className = 'tiny ' + (selectedDeptTab===dept.id ? 'primary' : 'ghost');
      b.textContent = `${dept.icon} ${dept.label} (${count}명)`;
      b.onclick = () => {
        selectedDeptTab = dept.id;
        const stillValid = selectedPlanner && planners.find(p => p.id===selectedPlanner && (p.dept||'plan')===dept.id);
        if(!stillValid){
          const first = planners.find(p => (p.dept||'plan')===dept.id);
          selectedPlanner = first ? first.id : null;
        }
        rerender();
      };
      wrap.appendChild(b);
    });
    container.appendChild(wrap);
  }

  function renderPlannerSidebar(){
    const box = document.getElementById('sidebarExtra'); box.innerHTML = '';
    const members = planners.filter(pl => (pl.dept||'plan') === selectedDeptTab);
    if(members.length === 0){
      box.innerHTML = '<div class="foot-note" style="padding:4px;">이 부서에 등록된 인원이 없습니다.</div>';
      return;
    }
    members.forEach(pl => {
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
      return { start: t.start, end: t.end, label: `[${t.project}] ${t.name}${isSupport ? ' (지원)' : ''}`, colorKey: t.project, task: t, navigate: () => { selectedPlannerProject = t.project; rerender(); } };
    });
    renderMonthGrid(calPanel, plannerCalMonthCursor, items);
    container.appendChild(calPanel);
  }

  function renderPlannerView(){
    const main = document.getElementById('main'); main.innerHTML = '';

    if(planners.length === 0){
      renderDeptTabs(main);
      const e = document.createElement('div'); e.className='empty'; e.textContent = '팀원을 추가해주세요.';
      main.appendChild(e); return;
    }

    // 다른 화면(캘린더 Quick Edit "이동", 종합 캘린더 매트릭스 등)에서 특정 사람으로
    // 바로 넘어온 경우, 상단 부서 탭을 그 사람 소속으로 맞춰줍니다.
    if(selectedPlanner){
      const cur = planners.find(p => p.id === selectedPlanner);
      if(cur) selectedDeptTab = cur.dept || 'plan';
    }
    if(!selectedPlanner || !planners.find(p => p.id===selectedPlanner && (p.dept||'plan')===selectedDeptTab)){
      const first = planners.find(p => (p.dept||'plan') === selectedDeptTab) || planners[0];
      selectedPlanner = first ? first.id : null;
      if(first) selectedDeptTab = first.dept || 'plan';
    }

    renderDeptTabs(main);
    renderPlannerSidebar();

    const pl = planners.find(p=>p.id===selectedPlanner);
    const conflicts = computeConflicts();
    const conflictIds = new Set();
    const conflictMap = new Map();
    conflicts.forEach(c => {
      conflictIds.add(c.a.id); conflictIds.add(c.b.id);
      if(!conflictMap.has(c.a.id)) conflictMap.set(c.a.id, []);
      if(!conflictMap.has(c.b.id)) conflictMap.set(c.b.id, []);
      conflictMap.get(c.a.id).push(c.b);
      conflictMap.get(c.b.id).push(c.a);
    });
    const allProjects = [...new Set(tasks.map(t=>t.project))];

    if(!selectedPlannerProject || !pl.projects.includes(selectedPlannerProject)){
      selectedPlannerProject = pl.projects.length ? pl.projects[0] : null;
    }

    const block = document.createElement('div'); block.className='planner-block';
    const headRow = document.createElement('div'); headRow.style.display = 'flex'; headRow.style.alignItems = 'center'; headRow.style.gap = '10px'; headRow.style.flexWrap = 'wrap';

    const nameLbl = document.createElement('div');
    nameLbl.style.fontFamily = 'var(--font-display)'; nameLbl.style.fontWeight = '700'; nameLbl.style.fontSize = '16px'; nameLbl.style.whiteSpace = 'nowrap';
    nameLbl.textContent = `${pl.name} · ${deptLabel(pl.dept||'plan')}`;
    headRow.appendChild(nameLbl);

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
          releaseDependsOnRefs(tasks.filter(t => t.ownerPlanner===pl.id && t.project===code).map(t=>t.id));
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
        releaseDependsOnRefs(tasks.filter(t => t.ownerPlanner === pl.id).map(t=>t.id));
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
      const actionsRow = document.createElement('div'); actionsRow.className = 'row'; actionsRow.style.marginTop = '0'; actionsRow.style.marginBottom = '10px';
      const resyncBtn = document.createElement('button'); resyncBtn.className = 'tiny ghost'; resyncBtn.textContent = '🔄 최신 앵커로 재동기화';
      resyncBtn.title = '마스터 일정(구글 시트)에서 앵커 날짜가 바뀌었을 때, 고정된 업무만 최신 날짜로 다시 맞춥니다. 직접 수정한 업무는 안 건드립니다.';
      resyncBtn.onclick = () => {
        const { updated, added } = resyncPlannerProjectAnchors(pl, code);
        alert(`${code} 고정 업무를 최신 앵커 기준으로 맞췄습니다. (갱신 ${updated}건, 새로 추가 ${added}건)`);
      };
      actionsRow.appendChild(resyncBtn);
      sub.appendChild(actionsRow);

      const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
      const table = document.createElement('table'); table.style.tableLayout = 'auto';
      table.innerHTML = `<tr><th>단위 업무 내용</th><th>시작 기한</th><th>종료 기한</th><th>근무일수</th><th style="text-align:center;">완료</th><th>선행 업무</th><th></th></tr>`;
      ownTasks.forEach(t => table.appendChild(plannerTaskRow(t, conflictIds, pl.id, conflictMap)));
      tableWrap.appendChild(table); sub.appendChild(tableWrap);

      if(ownTasks.length === 0){
        const addTaskBtn = document.createElement('button'); addTaskBtn.className = 'tiny primary'; addTaskBtn.style.marginTop='10px'; addTaskBtn.textContent = `+ 업무 수동 생성`;
        addTaskBtn.onclick = () => {
          const afterAnchor = anchors[0];
          const start = afterAnchor ? nextWorkingDay(afterAnchor.end) : new Date(TODAY);
          const nt = { id:genId(), project:code, category:'', name:'새 기획 업무', start, workingDays:1, progress:0, locked:false, fixed:false, dept:pl.dept||'plan', ownerPlanner:pl.id };
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
          const holidayName = HOLIDAYS.get(dateToIso(cellDate));
          if(holidayName){ cell.style.background = 'var(--holiday)'; }
          else if(isNonWorking(cellDate)){ cell.style.background = 'var(--weekend)'; }
          else { cell.style.background = 'var(--panel)'; }
          const num = document.createElement('div'); num.textContent = dayNum; num.style.fontSize = '11px';
          num.style.color = isToday ? 'var(--accent)' : (holidayName ? 'var(--holiday-text)' : 'var(--text-dim)');
          num.style.fontWeight = isToday ? '700' : '400';
          cell.appendChild(num);
          if(holidayName){
            const hLabel = document.createElement('div'); hLabel.textContent = holidayName;
            hLabel.style.fontSize = '9px'; hLabel.style.color = 'var(--holiday-text)'; hLabel.style.fontWeight = '600';
            hLabel.style.overflow = 'hidden'; hLabel.style.textOverflow = 'ellipsis'; hLabel.style.whiteSpace = 'nowrap';
            cell.appendChild(hLabel);
          }
          const numBottom = document.createElement('div'); numBottom.textContent = dayNum;
          numBottom.style.position = 'absolute'; numBottom.style.bottom = '2px'; numBottom.style.left = '4px';
          numBottom.style.fontSize = '10px'; numBottom.style.opacity = '0.55';
          numBottom.style.color = isToday ? 'var(--accent)' : (holidayName ? 'var(--holiday-text)' : 'var(--text-dim)'); numBottom.style.fontWeight = isToday ? '700' : '400';
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
        if(p.it.task) { bar.style.cursor = 'pointer'; bar.onclick = () => showCalendarQuickEdit(p.it.task, p.it.navigate); }
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
          items.push({ start: a.start, end: a.end, label: `[${s.code}] ${a.name}`, colorKey: s.code, task: a, navigate: () => { view='project'; selectedProject=s.code; syncNavActive(); rerender(); } });
        });
      });
    } else {
      planners.forEach(pl => {
        const own = tasks.filter(t => t.ownerPlanner===pl.id);
        const support = tasks.filter(t => t.ownerPlanner!==pl.id && Array.isArray(t.supporters) && t.supporters.includes(pl.id));
        [...own, ...support].forEach(t => {
          items.push({ start: t.start, end: t.end, label: `[${pl.name}] ${t.name}`, colorKey: pl.name, task: t, navigate: () => { view='planner'; selectedPlanner=pl.id; syncNavActive(); rerender(); } });
        });
      });
    }

    renderMonthGrid(calPanel, overviewMonthCursor, items); main.appendChild(calPanel);
  }

  // ---------------- 마스터 동기화 렌더러 ----------------
  function rerender(){
    const tw = document.querySelector('.table-wrap');
    const savedScroll = tw ? tw.scrollTop : 0;
    if(view === 'project') renderProjectView();
    else if(view === 'planner') renderPlannerView();
    else renderOverviewView();
    const tw2 = document.querySelector('.table-wrap');
    if(tw2) tw2.scrollTop = savedScroll;
  }

  function syncNavActive(){
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }
