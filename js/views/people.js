/* 인력 현황 화면. 공통 DOM·상태 함수는 js/render.js, js/state.js에서 제공합니다. */

function renderPeople(main){
  const scopeUsers = activeUsers().filter(user => isPM() || isAdmin() || user.departmentId === currentProfile?.departmentId);
  // 화면을 열 때만 인력별 업무량과 진행 업무를 한 번 계산해 재사용합니다.
  // 기존에는 정렬·필터·카드 생성 단계마다 같은 계산을 반복해 전환 시 끊김이 있었습니다.
  const summaries = new Map(scopeUsers.map(user => [user.id, userWorkloadSummary(user.id)]));
  const tasksByUser = new Map(scopeUsers.map(user => [user.id, []]));
  activeTasks().filter(task => task.status !== 'done').forEach(task => {
    const assigneeIds = new Set([task.assigneeId, ...(task.assignees || []).map(item => item.userId)].filter(Boolean));
    assigneeIds.forEach(userId => { if(tasksByUser.has(userId)) tasksByUser.get(userId).push(task); });
  });
  tasksByUser.forEach(list => list.sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'))));
  const groups = { ok: 0, warn: 0, danger: 0 };
  scopeUsers.forEach(user => { const level = summaries.get(user.id).assessment.level; groups[level] = (groups[level] || 0) + 1; });
  const layout = el('section', 'people-layout');
  const sidebar = el('aside', 'people-summary-panel');
  sidebar.appendChild(el('h2', '', '인력 요약'));
  const summary = el('div', 'people-summary-list');
  [[`전체 인원`, `${scopeUsers.length}명`, ''], ['여유 인력', `${groups.ok}명`, 'ok'], ['주의', `${groups.warn}명`, 'warn'], ['과부하', `${groups.danger}명`, 'danger']].forEach(([label, value, tone]) => {
    const row = el('div', `people-summary-row ${tone}`); row.append(el('span', '', label), el('strong', '', value)); summary.appendChild(row);
  });
  sidebar.appendChild(summary);
  const toolbar = el('div', 'people-view-toolbar');
  [['department', '직군별'], ['risk', '위험 업무'], ['available', '가용 인력'], ['all', '전체 인력']].forEach(([id, label]) => toolbar.appendChild(button(label, peopleView === id ? 'primary tiny' : 'ghost tiny', () => { peopleView = id; rerender(); })));
  sidebar.appendChild(toolbar);
  const content = el('section', 'people-content'); layout.append(sidebar, content); main.appendChild(layout);
  const visible = scopeUsers.filter(user => {
    const summary = summaries.get(user.id);
    return peopleView === 'risk' ? summary.riskCount > 0 || summary.assessment.weeklyLoad >= 80 : peopleView === 'available' ? summary.assessment.weeklyLoad < 80 : true;
  });
  if(!scopeUsers.length) { content.appendChild(el('div', 'empty', '표시할 활성 인력이 없습니다.')); return; }

  if(peopleView === 'department') {
    const departmentOrder = ['development', 'ui', 'planning', 'qa', 'business', 'server', 'video', 'studio', 'pm'];
    const orderedDepartments = [...new Set(visible.map(user => user.departmentId))].sort((a, b) => {
      const aIndex = departmentOrder.indexOf(a); const bIndex = departmentOrder.indexOf(b);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex) || departmentName(a).localeCompare(departmentName(b));
    });
    const board = el('section', 'people-department-board');
    orderedDepartments.forEach(departmentId => {
      const members = visible.filter(user => user.departmentId === departmentId).sort((a, b) => summaries.get(b.id).assessment.weeklyLoad - summaries.get(a.id).assessment.weeklyLoad || String(a.name || '').localeCompare(String(b.name || '')));
      const column = el('section', 'people-department-column');
      const heading = el('div', 'people-department-column-head');
      heading.append(el('h2', '', departmentName(departmentId)), el('span', '', `${members.length}명`));
      const cards = el('div', 'people-mini-list');
      members.forEach(user => {
        const summary = summaries.get(user.id); const assessment = summary.assessment;
        const currentTasks = tasksByUser.get(user.id) || [];
        const nextTask = currentTasks[0];
        const card = el('article', `people-mini-card ${assessment.level}`);
        const cardHead = el('div', 'people-mini-card-head');
        cardHead.append(el('strong', '', user.name || user.email), el('span', `tag ${assessment.level}`, assessment.weeklyLoad > 100 ? `과부하 ${assessment.weeklyLoad}%` : assessment.weeklyLoad >= 80 ? `주의 ${assessment.weeklyLoad}%` : `여유 ${assessment.weeklyLoad}%`));
        const taskTitle = nextTask ? nextTask.title : '진행 중인 업무 없음';
        const taskMeta = nextTask ? `${projectCode(nextTask)} · ${nextTask.dueDate ? `${fmtDate(nextTask.dueDate)}까지` : '일정 미정'}` : `다음 가능일 ${fmtDate(assessment.nextDate)}`;
        card.append(cardHead, el('p', 'people-mini-task', taskTitle), el('p', 'people-mini-meta', taskMeta));
        cards.appendChild(card);
      });
      column.append(heading, cards); board.appendChild(column);
    });
    content.appendChild(board);
    return;
  }

  const list = el('section', 'people-list');
  visible.sort((a, b) => summaries.get(b.id).assessment.weeklyLoad - summaries.get(a.id).assessment.weeklyLoad);
  visible.forEach(user => {
    const summary = summaries.get(user.id); const assessment = summary.assessment;
    const card = el('article', `person-row ${assessment.level}`);
    const identity = el('div', 'person-identity'); identity.append(el('strong', '', user.name || user.email), el('span', 'foot-note', `${departmentName(user.departmentId)} · ${userRoleLabel(user)}`));
    const workload = el('div', 'person-workload'); workload.append(el('span', `tag ${assessment.level}`, assessment.weeklyLoad > 100 ? '과부하' : assessment.weeklyLoad >= 80 ? '주의' : '여유'), el('strong', '', `${assessment.weeklyLoad}%`), el('span', 'foot-note', `다음 가능일 ${fmtDate(assessment.nextDate)}`));
    const currentTasks = tasksByUser.get(user.id) || [];
    const reason = el('p', 'foot-note', currentTasks.length ? `현재 업무 · ${currentTasks.slice(0, 2).map(task => `${task.title} (${fmtDate(task.dueDate)}까지)`).join(' · ')}` : '진행 중인 업무가 없습니다.');
    card.append(identity, personProjectBadges(user.id), workload, reason); list.appendChild(card);
  });
  content.appendChild(list);
}
