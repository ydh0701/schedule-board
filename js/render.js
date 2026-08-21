/* render.js — 로그인, 프로젝트 일정, 실무 일정 화면 */

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text !== undefined) node.textContent = text;
  return node;
}
function button(label, className, onClick){
  const node = el('button', className, label);
  node.type = onClick ? 'button' : 'submit'; node.onclick = onClick;
  return node;
}
function showToast(message, tone = 'success'){
  document.querySelector('.app-toast')?.remove();
  const toast = el('div', `app-toast ${tone}`, message);
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}
function fmtDate(value){ return value ? String(value).slice(0, 10) : '일정 미정'; }
function statusClass(status){ return status === 'done' ? 'ok' : status === 'blocked' ? 'danger' : status === 'in_progress' ? 'accent' : 'neutral'; }
function healthLabel(health){ return { on_track: '정상', at_risk: '주의', off_track: '위험' }[health] || '미설정'; }
function healthClass(health){ return health === 'on_track' ? 'ok' : health === 'at_risk' ? 'warn' : health === 'off_track' ? 'danger' : 'neutral'; }
function timeOffLabel(type){ return { leave: '휴가', sick: '병가', external: '외근', other: '부재' }[type] || '부재'; }
function userName(uid){
  if(uid === currentUser?.uid) return currentProfile?.name || currentUser?.displayName || '나';
  return visibleUsers.find(user => user.id === uid)?.name || '담당자 미확인';
}

function renderAccountActions(){
  const target = document.getElementById('accountActions');
  target.innerHTML = '';
  if(currentUser){
    const profile = el('span', 'account-chip', (currentProfile?.name || currentUser.displayName || currentUser.email || '?').slice(0, 1).toUpperCase());
    profile.title = currentUser.email || '';
    target.append(profile);
    if(isAdmin()) target.appendChild(button('사용자 관리', 'tiny ghost', openAdminManager));
    target.appendChild(button('로그아웃', 'tiny ghost', signOut));
  }
}

function loginScreen(main){
  const wrap = el('section', 'auth-screen');
  const panel = el('div', 'auth-panel panel');
  const intro = el('div', 'auth-intro');
  const logoWrap = el('div', 'auth-logo-wrap');
  const logo = document.createElement('img'); logo.src = 'assets/storytaco-logo.png'; logo.alt = 'STORYTACO'; logo.className = 'auth-logo';
  logo.onerror = () => { logo.remove(); logoWrap.classList.add('logo-missing'); logoWrap.textContent = 'STORYTACO'; };
  logoWrap.appendChild(logo);
  intro.append(logoWrap, el('p', 'eyebrow', 'STORYTACO INTERNAL'), el('h2', '', '사내 일정 관리'));
  intro.append(el('p', 'sub', '프로젝트와 실무 일정을 한곳에서 실시간으로 관리합니다.'));
  panel.appendChild(intro);
  const login = button('Google 계정으로 로그인', 'primary auth-login-button', requestGoogleLogin);
  wrap.append(panel, login, el('p', 'auth-help', '처음 로그인한 계정은 관리자 승인이 필요합니다.'));
  main.appendChild(wrap);
}

function pendingScreen(main){
  const wrap = el('section', 'pending-screen');
  const panel = el('section', 'pending-panel panel');
  panel.append(el('p', 'eyebrow', 'ACCESS PENDING'), el('h2', '', '관리자 승인 대기 중'));
  panel.append(el('p', 'sub', `${currentUser?.email || '현재 계정'}으로 접근을 요청했습니다. 관리자에게 역할과 소속 부서 배정을 요청해주세요.`));
  if(profileLookup?.status === 'missing') {
    const check = el('div', 'profile-check');
    check.append(el('span', 'profile-check-label', '권한 문서를 찾지 못했습니다. 아래 확인 코드를 사용해주세요.'), el('code', 'profile-check-code', profileLookup.uid));
    panel.append(check);
  } else if(profileLookup?.status === 'inactive' || profileLookup?.status === 'error') {
    const label = profileLookup.status === 'inactive' ? '권한 문서를 찾았지만 활성 상태가 아닙니다.' : '권한 문서를 읽지 못했습니다.';
    const check = el('div', 'profile-check');
    check.append(el('span', 'profile-check-label', label), el('code', 'profile-check-code', profileLookup.message));
    panel.append(check);
  }
  panel.appendChild(button('로그아웃', 'ghost', signOut));
  wrap.appendChild(panel);
  main.appendChild(wrap);
}

function renderHome(main){
  const intro = el('section', 'workspace-intro');
  intro.append(el('p', 'eyebrow', 'STORYTACO WORKSPACE'), el('h2', '', '어떤 일정을 관리할까요?'), el('p', 'sub', '프로젝트 흐름과 팀 실무를 목적에 맞게 나누어 관리합니다.'));
  const modules = el('div', 'workspace-modules');
  const open = view => { activeView = view; selectedProjectId = null; rerender(); };
  const project = button('', 'workspace-card project-workspace', () => open('projects'));
  project.append(el('span', 'workspace-icon', '◫'), el('span', 'workspace-type', 'PROJECT PORTFOLIO'), el('strong', '', '프로젝트 일정'), el('span', 'workspace-copy', '전체 프로젝트의 진행률, 마감일, 위험 신호를 확인합니다.'), el('span', 'workspace-action', '프로젝트 현황 보기  →'));
  const work = button('', 'workspace-card work-workspace', () => open('work'));
  work.append(el('span', 'workspace-icon', '✓'), el('span', 'workspace-type', 'TEAM OPERATIONS'), el('strong', '', '실무 일정'), el('span', 'workspace-copy', '팀 업무, 휴가·부재, 주간 업무량을 관리합니다.'), el('span', 'workspace-action', '실무 일정 보기  →'));
  modules.append(project, work);
  main.append(intro, modules);
}

function renderHomeBack(main){
  main.appendChild(button('← 메뉴 선택', 'tiny ghost menu-back', () => { activeView = 'home'; selectedProjectId = null; rerender(); }));
}

function progressBlock(progress){
  const wrap = el('div', 'progress-line');
  const track = el('div', 'prog-track');
  const fill = el('div', `prog-fill ${progress >= 70 ? 'ok' : progress >= 30 ? 'accent' : 'warn'}`);
  fill.style.width = `${progress || 0}%`;
  track.appendChild(fill);
  wrap.append(track, el('span', 'prog-num', progress === null ? '–' : `${progress}%`));
  return wrap;
}

function projectCard(project){
  const list = tasksForProject(project.id);
  const done = list.filter(task => task.status === 'done').length;
  const overdue = list.filter(taskIsOverdue).length;
  const deadlines = list.filter(task => task.status !== 'done' && task.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const card = el('article', 'proj-card');
  card.tabIndex = 0;
  const open = () => { selectedProjectId = project.id; rerender(); };
  card.onclick = open;
  card.onkeydown = event => { if(event.key === 'Enter' || event.key === ' ') open(); };
  const cardHead = el('div', 'project-card-head');
  const title = el('div', 'proj-card-code', project.code || project.name);
  cardHead.append(title, el('span', `tag ${healthClass(project.health)}`, healthLabel(project.health)));
  card.append(cardHead);
  if(project.code) card.append(el('div', 'foot-note', project.name));
  card.append(progressBlock(projectProgress(project.id)));
  card.append(el('div', 'foot-note', `완료 ${done} / 전체 ${list.length}`));
  if(deadlines[0]) card.append(el('div', 'project-deadline', `다음 마감 · ${deadlines[0].title} (${fmtDate(deadlines[0].dueDate)})`));
  if(overdue) card.append(el('div', 'warning-text', `지연 업무 ${overdue}건`));
  return card;
}

function metric(label, value, tone){ const node = el('div', `metric-card ${tone || ''}`); node.append(el('span', 'metric-label', label), el('strong', 'metric-value', String(value))); return node; }

function renderProjects(main){
  const head = el('section', 'panel page-heading'); const copy = el('div', 'page-copy');
  copy.append(el('p', 'eyebrow', selectedProjectId ? 'PROJECT DETAIL' : 'PORTFOLIO'), el('h2', '', selectedProjectId ? '프로젝트 상세' : '전체 프로젝트 현황'));
  copy.append(el('p', 'sub', selectedProjectId ? '프로젝트 기준으로 모든 부서의 업무 흐름을 확인합니다.' : '진행률, 위험 신호, 마감 일정을 한눈에 확인하세요.'));
  head.appendChild(copy);
  if(!selectedProjectId && canManageProjects()) head.appendChild(button('+ 프로젝트 추가', 'primary', () => openProjectCreator()));
  main.appendChild(head);
  if(selectedProjectId) {
    renderProjectDetail(main, projects.find(project => project.id === selectedProjectId));
    return;
  }
  const activeProjects = projects.filter(project => project.status !== 'archived');
  const atRisk = activeProjects.filter(project => ['at_risk', 'off_track'].includes(project.health)).length;
  const overdue = activeTasks().filter(taskIsOverdue).length;
  const metrics = el('div', 'metric-grid'); metrics.append(metric('진행 중 프로젝트', activeProjects.length), metric('주의·위험 프로젝트', atRisk, atRisk ? 'danger' : ''), metric('지연 업무', overdue, overdue ? 'danger' : ''));
  main.appendChild(metrics);
  if(!projects.length) {
    main.appendChild(el('div', 'empty', '등록된 프로젝트가 없습니다. 관리자가 첫 프로젝트를 만들어주세요.'));
    return;
  }
  const grid = el('div', 'proj-card-grid');
  activeProjects.forEach(project => grid.appendChild(projectCard(project)));
  main.appendChild(grid);
}

function taskRow(task, showProject){
  const row = el('article', `task-row ${taskIsOverdue(task) ? 'overdue' : ''}`);
  const body = el('div', 'task-main');
  body.append(el('strong', 'task-title', task.title));
  const meta = [];
  if(showProject && task.projectId) meta.push(projects.find(project => project.id === task.projectId)?.code || projects.find(project => project.id === task.projectId)?.name || '프로젝트');
  meta.push(departmentName(task.departmentId), userName(task.assigneeId));
  if(task.startDate || task.dueDate) meta.push(`${fmtDate(task.startDate)} ~ ${fmtDate(task.dueDate)}`);
  const milestone = milestones.find(item => item.id === task.milestoneId);
  if(milestone) meta.push(`마일스톤: ${milestone.title}`);
  const dependencies = taskDependencies(task);
  if(dependencies.length) meta.push(`선행: ${dependencies.map(item => item.title).join(', ')}`);
  body.append(el('div', 'task-meta', meta.join(' · ')));
  row.appendChild(body);
  const state = el('div', 'task-state');
  state.append(el('span', `tag ${statusClass(task.status)}`, TASK_STATUS[task.status] || '할 일'), el('span', 'task-progress', `${task.progress}%`));
  if(taskHasUnfinishedDependencies(task)) state.appendChild(el('span', 'tag warn', '선행 대기'));
  row.appendChild(state);
  if(canEditTask(task)) row.appendChild(button('수정', 'tiny ghost', () => openTaskEditor(task)));
  return row;
}

function renderProjectDetail(main, project){
  if(!project) { selectedProjectId = null; rerender(); return; }
  main.appendChild(button('← 전체 프로젝트', 'tiny ghost', () => { selectedProjectId = null; rerender(); }));
  const detail = el('section', 'panel project-detail');
  detail.append(el('h2', '', project.code || project.name));
  if(project.code) detail.append(el('p', 'sub', project.name));
  detail.append(progressBlock(projectProgress(project.id)));
  detail.append(el('span', `tag ${healthClass(project.health)}`, `프로젝트 상태 · ${healthLabel(project.health)}`));
  main.appendChild(detail);
  const updates = updatesForProject(project.id);
  const updateSection = el('section', 'panel');
  const updateHead = el('div', 'section-title-row'); updateHead.append(el('h2', '', '프로젝트 업데이트'));
  if(isAdmin() || isLead()) updateHead.appendChild(button('+ 주간 업데이트', 'tiny primary', () => openProjectUpdateEditor(project)));
  updateSection.appendChild(updateHead);
  if(!updates.length) updateSection.append(el('p', 'sub', '아직 작성된 프로젝트 업데이트가 없습니다.'));
  updates.slice(0, 3).forEach(update => {
    const row = el('article', 'project-update');
    const titleRow = el('div', 'section-title-row'); titleRow.append(el('span', `tag ${healthClass(update.health)}`, healthLabel(update.health)));
    titleRow.append(el('span', 'foot-note', update.createdByName || '작성자 미상'));
    row.appendChild(titleRow);
    if(update.achievements) row.append(el('p', 'update-copy', `완료 · ${update.achievements}`));
    if(update.blockers) row.append(el('p', 'update-copy blocker-copy', `막힌 일 · ${update.blockers}`));
    if(update.nextSteps) row.append(el('p', 'update-copy', `다음 · ${update.nextSteps}`));
    updateSection.appendChild(row);
  });
  main.appendChild(updateSection);
  const milestoneList = milestonesForProject(project.id);
  const milestoneSection = el('section', 'panel');
  const milestoneHead = el('div', 'section-title-row');
  milestoneHead.append(el('h2', '', `마일스톤 · ${milestoneList.length}건`));
  if(canManageProjects()) milestoneHead.appendChild(button('+ 마일스톤 추가', 'tiny primary', () => openMilestoneEditor(null, project.id)));
  milestoneSection.appendChild(milestoneHead);
  if(!milestoneList.length) milestoneSection.append(el('p', 'sub', '등록된 마일스톤이 없습니다.'));
  milestoneList.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).forEach(milestone => {
    const row = el('article', 'task-row');
    const body = el('div', 'task-main'); body.append(el('strong', 'task-title', milestone.title));
    body.append(el('div', 'task-meta', `${milestone.version || '공통'} · ${fmtDate(milestone.dueDate)}`));
    row.append(body, el('span', `tag ${statusClass(milestone.status)}`, TASK_STATUS[milestone.status] || '할 일'), progressBlock(milestoneProgress(milestone.id)));
    if(canManageProjects()) row.appendChild(button('수정', 'tiny ghost', () => openMilestoneEditor(milestone, project.id)));
    milestoneSection.appendChild(row);
  });
  main.appendChild(milestoneSection);
  const list = tasksForProject(project.id);
  const section = el('section', 'panel');
  section.append(el('h2', '', `연결된 업무 · ${list.length}건`));
  if(!list.length) section.append(el('p', 'sub', '아직 연결된 업무가 없습니다. 팀장 또는 관리자가 업무를 추가할 수 있습니다.'));
  list.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).forEach(task => section.appendChild(taskRow(task, false)));
  main.appendChild(section);
  if(canManageProjects()) main.appendChild(button('프로젝트 정보 수정', 'tiny ghost', () => openProjectEditor(project)));
}

function renderWork(main){
  const heading = el('section', 'panel page-heading'); const copy = el('div', 'page-copy');
  const label = isAdmin() ? '전체 실무 일정' : isLead() ? `${departmentName(currentProfile.departmentId)}팀 실무 일정` : '내 실무 일정';
  copy.append(el('p', 'eyebrow', isMember() ? 'MY WORK' : 'TEAM OPERATIONS'), el('h2', '', label));
  copy.append(el('p', 'sub', isMember() ? '내 업무의 상태, 진척률, 일정과 내용을 갱신합니다.' : '업무 배정, 일정, 팀의 가용량을 함께 관리합니다.'));
  heading.appendChild(copy);
  main.appendChild(heading);
  const actions = el('div', 'row');
  if(isAdmin() || isLead()) actions.appendChild(button('+ 업무 추가', 'primary', () => openTaskEditor(null)));
  actions.appendChild(button('+ 휴가·부재 등록', 'tiny ghost', () => openTimeOffEditor(null)));
  main.appendChild(actions);
  const modes = el('nav', 'view-tabs');
  [['list', '목록'], ['calendar', '월간 캘린더'], ['capacity', '주간 업무량']].forEach(([key, label]) => modes.appendChild(button(label, workViewMode === key ? 'primary tiny' : 'ghost tiny', () => { workViewMode = key; rerender(); })));
  main.appendChild(modes);
  const list = workTasks();
  const workMetrics = el('div', 'metric-grid compact-metrics');
  workMetrics.append(metric('활성 업무', list.length), metric('오늘·3일 내 마감', list.filter(task => task.dueDate && Math.round((localDate(task.dueDate) - new Date(new Date().setHours(0,0,0,0))) / 86400000) <= 3 && task.status !== 'done').length, 'warn'), metric('차단됨', list.filter(task => task.status === 'blocked').length, 'danger'));
  main.appendChild(workMetrics);
  renderDueAlerts(main, list);
  if(!list.length) { main.appendChild(el('div', 'empty', '표시할 업무가 없습니다.')); return; }
  if(workViewMode === 'calendar') { renderWorkCalendar(main, list); return; }
  if(workViewMode === 'capacity') { renderCapacity(main, list); return; }
  const section = el('section', 'task-list');
  list.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).forEach(task => section.appendChild(taskRow(task, true)));
  main.appendChild(section);
}

function workTasks(){ return activeTasks().filter(task => isAdmin() || isLead() || task.assigneeId === currentUser.uid); }

function renderDueAlerts(main, list){
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const notices = list.filter(task => {
    if(task.status === 'done' || !task.dueDate) return false;
    const due = localDate(task.dueDate); const difference = Math.round((due - today) / 86400000);
    return difference <= 3;
  }).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  if(!notices.length) return;
  const panel = el('section', 'due-alerts'); panel.append(el('strong', '', '마감 알림'));
  notices.slice(0, 5).forEach(task => {
    const due = localDate(task.dueDate); const difference = Math.round((due - today) / 86400000);
    const label = difference < 0 ? `${Math.abs(difference)}일 지연` : difference === 0 ? '오늘 마감' : `${difference}일 남음`;
    const item = el('button', `due-alert ${difference < 0 ? 'overdue' : ''}`, `${label} · ${task.title}`);
    item.type = 'button'; item.onclick = () => canEditTask(task) && openTaskEditor(task); panel.appendChild(item);
  });
  main.appendChild(panel);
}

function renderWorkCalendar(main, list){
  const nav = el('div', 'calendar-nav');
  nav.appendChild(button('◀', 'tiny ghost', () => { workCalendarCursor.setMonth(workCalendarCursor.getMonth() - 1); rerender(); }));
  nav.append(el('strong', '', `${workCalendarCursor.getFullYear()}년 ${workCalendarCursor.getMonth() + 1}월`));
  nav.appendChild(button('▶', 'tiny ghost', () => { workCalendarCursor.setMonth(workCalendarCursor.getMonth() + 1); rerender(); }));
  main.appendChild(nav);
  const grid = el('section', 'work-calendar');
  ['일', '월', '화', '수', '목', '금', '토'].forEach(label => grid.appendChild(el('div', 'work-calendar-dow', label)));
  const year = workCalendarCursor.getFullYear(), month = workCalendarCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate();
  for(let index = 0; index < firstDay; index++) grid.appendChild(el('div', 'work-calendar-cell muted-cell'));
  for(let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month, day); const cell = el('div', `work-calendar-cell ${isWeekday(date) ? '' : 'weekend-cell'}`);
    cell.appendChild(el('span', 'calendar-date', String(day)));
    list.filter(task => taskCoversDate(task, date)).slice(0, 4).forEach(task => {
      const chip = el('button', `calendar-task ${task.status === 'done' ? 'done-task' : ''}`, task.title);
      chip.type = 'button'; chip.title = `${userName(task.assigneeId)} · ${task.title}`; chip.onclick = () => canEditTask(task) && openTaskEditor(task);
      cell.appendChild(chip);
    });
    timeOffs.filter(item => date >= localDate(item.startDate) && date <= localDate(item.endDate)).slice(0, 2).forEach(item => {
      const chip = el('button', 'calendar-absence', `${timeOffLabel(item.type)} · ${userName(item.userId)}`);
      chip.type = 'button'; chip.onclick = () => openTimeOffEditor(item); cell.appendChild(chip);
    });
    const extra = list.filter(task => taskCoversDate(task, date)).length - 4;
    if(extra > 0) cell.appendChild(el('span', 'calendar-more', `+${extra}건`));
    grid.appendChild(cell);
  }
  main.appendChild(grid);
}

function mondayOf(date){
  const result = new Date(date); const offset = (result.getDay() + 6) % 7; result.setDate(result.getDate() - offset); result.setHours(0, 0, 0, 0); return result;
}
function renderCapacity(main, list){
  const monday = mondayOf(capacityWeekCursor);
  const days = Array.from({ length: 5 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
  const heading = el('section', 'panel'); const title = el('div', 'section-title-row'); title.append(el('h2', '', '주간 예상 업무량'));
  const nav = el('div', 'calendar-nav');
  nav.appendChild(button('◀', 'tiny ghost', () => { capacityWeekCursor.setDate(capacityWeekCursor.getDate() - 7); rerender(); }));
  nav.append(el('strong', '', `${fmtDate(dateKey(days[0]))} ~ ${fmtDate(dateKey(days[4]))}`));
  nav.appendChild(button('▶', 'tiny ghost', () => { capacityWeekCursor.setDate(capacityWeekCursor.getDate() + 7); rerender(); }));
  title.appendChild(nav); heading.append(title);
  heading.append(el('p', 'sub', '예상 작업일을 업무 기간의 평일에 균등 배분합니다. 1일 초과 배정은 경고로 표시됩니다.')); main.appendChild(heading);
  const assignees = [...new Set(list.map(task => task.assigneeId))];
  const tableWrap = el('div', 'table-wrap panel'); const table = document.createElement('table');
  const thead = document.createElement('thead'); const headRow = document.createElement('tr');
  ['담당자', ...days.map(day => `${day.getMonth() + 1}/${day.getDate()}`), '합계'].forEach(label => headRow.appendChild(el('th', '', label))); thead.appendChild(headRow); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  assignees.forEach(assigneeId => {
    const row = document.createElement('tr'); row.appendChild(el('td', '', userName(assigneeId)));
    let total = 0;
    days.forEach(day => { const absence = absenceFor(assigneeId, day); const load = list.filter(task => task.assigneeId === assigneeId).reduce((sum, task) => sum + taskDailyLoad(task, day), 0); total += load; const cell = el('td', absence ? 'absence-cell' : load > 1 ? 'capacity-over' : '', absence ? timeOffLabel(absence.type) : `${load.toFixed(1)}일`); row.appendChild(cell); });
    row.appendChild(el('td', total > 5 ? 'capacity-over' : '', `${total.toFixed(1)}일`)); tbody.appendChild(row);
  });
  table.appendChild(tbody); tableWrap.appendChild(table); main.appendChild(tableWrap);
}

function adminAccessPanel(){
  const panel = el('section', 'panel admin-access-panel');
  const title = el('div', 'section-title-row'); title.append(el('h2', '', '사용자 및 권한 관리'));
  title.appendChild(el('span', 'foot-note', `승인 대기 ${accessRequests.length}명 · 활성 사용자 ${visibleUsers.length}명`));
  panel.appendChild(title);
  if(accessRequests.length) {
    panel.append(el('h3', 'small-heading', '승인 대기'));
    accessRequests.forEach(request => {
      const row = el('div', 'admin-user-row');
      row.append(el('div', '', request.name || request.email || '이름 미지정'));
      row.append(el('span', 'foot-note', request.email || '이메일 없음'));
      row.appendChild(button('승인 및 배정', 'tiny primary', () => openApprovalEditor(request)));
      panel.appendChild(row);
    });
  }
  panel.append(el('h3', 'small-heading', '활성 사용자'));
  visibleUsers.forEach(user => {
    const row = el('div', 'admin-user-row');
    row.append(el('div', '', user.name || user.email));
    row.append(el('span', 'foot-note', `${user.email || ''} · ${userRoleLabel(user)}${user.departmentId ? ' · ' + departmentName(user.departmentId) : ''}`));
    row.appendChild(button('권한 수정', 'tiny ghost', () => openUserRoleEditor(user)));
    panel.appendChild(row);
  });
  return panel;
}

function openAdminManager(){
  const { dialog } = openDialog('사용자 및 권한 관리');
  const panel = adminAccessPanel();
  panel.classList.add('admin-manager-panel');
  dialog.appendChild(panel);
}

function inputField(label, placeholder, type = 'text'){
  const wrap = el('label', 'field'); wrap.append(el('span', '', label));
  const input = document.createElement('input'); input.type = type; input.placeholder = placeholder || ''; wrap.appendChild(input);
  return { wrap, input };
}
function selectField(label, options){
  const wrap = el('label', 'field'); wrap.append(el('span', '', label));
  const select = document.createElement('select');
  options.forEach(([value, labelText]) => { const option = new Option(labelText, value); select.add(option); });
  wrap.appendChild(select); return { wrap, select };
}
function multiSelectField(label){
  const wrap = el('label', 'field'); wrap.append(el('span', '', label));
  const select = document.createElement('select'); select.multiple = true; select.size = 4;
  wrap.appendChild(select); return { wrap, select };
}

function openDialog(title){
  const overlay = el('div', 'modal-backdrop');
  const dialog = el('section', 'modal panel');
  const cleanup = [];
  const close = () => { cleanup.splice(0).forEach(fn => fn()); overlay.remove(); };
  const header = el('div', 'modal-header'); header.append(el('h2', '', title));
  header.appendChild(button('×', 'tiny ghost', close));
  dialog.appendChild(header); overlay.appendChild(dialog);
  overlay.onclick = event => { if(event.target === overlay) close(); };
  document.body.appendChild(overlay);
  return { overlay, dialog, close, onClose: fn => cleanup.push(fn) };
}

function openProjectEditor(project){
  const { overlay, dialog } = openDialog('프로젝트 정보 수정');
  const form = el('form', 'form-grid');
  const name = inputField('프로젝트명', ''); name.input.value = project.name || '';
  const code = inputField('코드', ''); code.input.value = project.code || '';
  form.append(name.wrap, code.wrap, button('저장', 'primary'));
  form.onsubmit = async event => { event.preventDefault(); try { await saveProject({ ...project, name: name.input.value, code: code.input.value }); overlay.remove(); } catch(error) { alert(error.message); } };
  dialog.appendChild(form);
}

function openProjectCreator(){
  const { dialog, close } = openDialog('프로젝트 추가');
  dialog.classList.add('project-create-dialog');
  const form = el('form', 'form-grid project-create-form');
  const name = inputField('프로젝트명', '예: 프로젝트 12');
  const code = inputField('프로젝트 코드', '예: PC12');
  const actions = el('div', 'form-actions project-create-actions');
  const submit = button('프로젝트 만들기', 'primary');
  const error = el('p', 'form-error'); error.hidden = true;
  const showFieldError = (field, message) => {
    field.input.classList.toggle('input-invalid', !!message);
    field.wrap.classList.toggle('field-invalid', !!message);
    field.wrap.querySelector('.field-error')?.remove();
    if(message) field.wrap.appendChild(el('span', 'field-error', message));
  };
  const clearError = field => { showFieldError(field, ''); error.hidden = true; };
  name.input.oninput = () => clearError(name);
  code.input.oninput = () => clearError(code);
  actions.appendChild(submit);
  form.append(name.wrap, code.wrap, error, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    const missingName = !name.input.value.trim();
    const missingCode = !code.input.value.trim();
    showFieldError(name, missingName ? '프로젝트명을 입력해주세요.' : '');
    showFieldError(code, missingCode ? '프로젝트 코드를 입력해주세요.' : '');
    if(missingName || missingCode) {
      error.textContent = '프로젝트명과 프로젝트 코드를 모두 입력해주세요.';
      error.hidden = false;
      (missingName ? name : code).input.focus();
      return;
    }
    submit.disabled = true; submit.textContent = '생성 중…';
    try {
      await saveProject({ name: name.input.value, code: code.input.value });
      close();
    } catch(cause) {
      error.textContent = `프로젝트를 만들지 못했습니다. ${cause.message || '잠시 후 다시 시도해주세요.'}`;
      error.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = '프로젝트 만들기';
    }
  };
  dialog.appendChild(form);
}

function openTaskEditor(task){
  const editing = !!task;
  const { dialog, close, onClose } = openDialog(editing ? '업무 수정' : '업무 추가');
  const form = el('form', 'form-grid');
  const title = inputField('업무명', '업무 내용을 입력하세요'); title.input.value = task?.title || '';
  const departmentOptions = DEPARTMENTS.filter(dept => isAdmin() || dept.id === currentProfile.departmentId).map(dept => [dept.id, dept.name]);
  const department = selectField('담당 부서', departmentOptions); department.select.value = task?.departmentId || currentProfile.departmentId || departmentOptions[0]?.[0] || '';
  const people = visibleUsers.filter(user => user.active && (!isLead() || user.departmentId === currentProfile.departmentId));
  const assignee = selectField('담당자', people.map(user => [user.id, user.name || user.email]));
  if(task?.assigneeId && !people.some(user => user.id === task.assigneeId)) assignee.select.add(new Option(userName(task.assigneeId), task.assigneeId));
  assignee.select.value = task?.assigneeId || '';
  const project = selectField('연결 프로젝트', [['', '프로젝트와 연결하지 않음'], ...projects.map(item => [item.id, item.code || item.name])]); project.select.value = task?.projectId || '';
  const milestone = selectField('연결 마일스톤', [['', '마일스톤과 연결하지 않음']]);
  const dependsOn = multiSelectField('선행 업무 (복수 선택 가능)');
  const refreshProjectRelations = () => {
    const projectId = project.select.value;
    const projectMilestones = milestonesForProject(projectId);
    milestone.select.innerHTML = '';
    milestone.select.add(new Option('마일스톤과 연결하지 않음', ''));
    projectMilestones.forEach(item => milestone.select.add(new Option(item.title, item.id)));
    milestone.select.value = task?.milestoneId || '';
    dependsOn.select.innerHTML = '';
    activeTasks().filter(item => item.id !== task?.id && (projectId ? item.projectId === projectId : item.departmentId === department.select.value)).forEach(item => {
      const option = new Option(item.title, item.id);
      option.selected = (task?.dependsOn || []).includes(item.id);
      dependsOn.select.add(option);
    });
  };
  project.select.onchange = refreshProjectRelations;
  department.select.onchange = refreshProjectRelations;
  refreshProjectRelations();
  const status = selectField('상태', Object.entries(TASK_STATUS)); status.select.value = task?.status || 'todo';
  const progress = inputField('진척률 (0~100)', '', 'number'); progress.input.min = '0'; progress.input.max = '100'; progress.input.value = task?.progress ?? 0;
  const estimate = inputField('예상 작업일', '예: 2.5', 'number'); estimate.input.min = '0'; estimate.input.step = '0.5'; estimate.input.value = task?.estimatedDays ?? '';
  const start = inputField('시작일', '', 'date'); start.input.value = dateOnly(task?.startDate);
  const due = inputField('마감일', '', 'date'); due.input.value = dateOnly(task?.dueDate);
  form.append(title.wrap, department.wrap, assignee.wrap, project.wrap, milestone.wrap, dependsOn.wrap, status.wrap, progress.wrap, estimate.wrap, start.wrap, due.wrap);
  const actions = el('div', 'form-actions'); actions.appendChild(button('저장', 'primary'));
  if(editing) actions.appendChild(button('업무 보관', 'danger-button', async () => { if(confirm('이 업무를 보관할까요?')) { await archiveTask(task.id); close(); } }));
  form.appendChild(actions);
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      await saveTask({ id: task?.id, title: title.input.value, departmentId: department.select.value, assigneeId: assignee.select.value, projectId: project.select.value || null, milestoneId: milestone.select.value || null, dependsOn: [...dependsOn.select.selectedOptions].map(option => option.value), status: status.select.value, progress: Number(progress.input.value), estimatedDays: Number(estimate.input.value), startDate: start.input.value || null, dueDate: due.input.value || null });
      close();
    } catch(error) { alert(error.message); }
  };
  dialog.appendChild(form);
  if(editing) renderTaskDiscussion(dialog, task.id, onClose);
}

function renderTaskDiscussion(dialog, taskId, onClose){
  const section = el('section', 'discussion'); section.append(el('h3', 'small-heading', '댓글 및 참고 링크'));
  const commentsBox = el('div', 'comment-list'); const linksBox = el('div', 'link-list');
  const commentForm = el('form', 'comment-form'); const commentInput = document.createElement('textarea'); commentInput.rows = 2; commentInput.placeholder = '@이름 으로 동료를 언급할 수 있습니다';
  commentForm.append(commentInput, button('댓글 등록', 'tiny primary'));
  commentForm.onsubmit = async event => { event.preventDefault(); try { await addTaskComment(taskId, commentInput.value); commentInput.value = ''; } catch(error) { alert(error.message); } };
  const linkForm = el('form', 'link-form');
  const linkLabel = document.createElement('input'); linkLabel.placeholder = '링크 제목 (선택)';
  const linkUrl = document.createElement('input'); linkUrl.type = 'url'; linkUrl.placeholder = 'https://...';
  linkForm.append(linkLabel, linkUrl, button('링크 추가', 'tiny ghost'));
  linkForm.onsubmit = async event => { event.preventDefault(); try { await addTaskLink(taskId, { label: linkLabel.value, url: linkUrl.value }); linkLabel.value = ''; linkUrl.value = ''; } catch(error) { alert(error.message); } };
  section.append(commentsBox, commentForm, linkForm, linksBox);
  const unsubscribe = watchTaskDiscussion(taskId, ({ comments, links }) => {
    commentsBox.innerHTML = ''; linksBox.innerHTML = '';
    if(!comments.length) commentsBox.append(el('p', 'foot-note', '아직 댓글이 없습니다.'));
    comments.forEach(comment => {
      const row = el('article', 'comment-item'); row.append(el('strong', '', comment.authorName || '이름 미지정'), el('span', 'comment-text', comment.text)); commentsBox.appendChild(row);
    });
    if(links.length) linksBox.append(el('h4', 'small-heading', '참고 링크'));
    links.forEach(item => {
      const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'reference-link'; link.textContent = `↗ ${item.label}`; linksBox.appendChild(link);
    });
  });
  onClose(unsubscribe);
}

function openMilestoneEditor(milestone, projectId){
  const editing = !!milestone;
  const { overlay, dialog } = openDialog(editing ? '마일스톤 수정' : '마일스톤 추가');
  const form = el('form', 'form-grid');
  const title = inputField('마일스톤명', '예: 컨셉 확정'); title.input.value = milestone?.title || '';
  const version = selectField('적용 버전', [['', '공통'], ['pc', 'PC'], ['mobile', '모바일']]); version.select.value = milestone?.version || '';
  const due = inputField('목표일', '', 'date'); due.input.value = dateOnly(milestone?.dueDate);
  const status = selectField('상태', Object.entries(TASK_STATUS)); status.select.value = milestone?.status || 'todo';
  form.append(title.wrap, version.wrap, due.wrap, status.wrap);
  const actions = el('div', 'form-actions'); actions.appendChild(button('저장', 'primary'));
  if(editing) actions.appendChild(button('보관', 'danger-button', async () => { if(confirm('이 마일스톤을 보관할까요?')) { await archiveMilestone(milestone.id); overlay.remove(); } }));
  form.appendChild(actions);
  form.onsubmit = async event => { event.preventDefault(); try { await saveMilestone({ ...milestone, projectId, title: title.input.value, version: version.select.value || null, dueDate: due.input.value || null, status: status.select.value }); overlay.remove(); } catch(error) { alert(error.message); } };
  dialog.appendChild(form);
}

function textareaField(label, placeholder){
  const wrap = el('label', 'field'); wrap.append(el('span', '', label));
  const textarea = document.createElement('textarea'); textarea.placeholder = placeholder || ''; textarea.rows = 3; wrap.appendChild(textarea);
  return { wrap, textarea };
}

function openProjectUpdateEditor(project){
  const { overlay, dialog } = openDialog('프로젝트 주간 업데이트');
  const form = el('form', 'form-grid');
  const health = selectField('프로젝트 상태', [['on_track', '정상'], ['at_risk', '주의'], ['off_track', '위험']]); health.select.value = project.health || 'on_track';
  const achievements = textareaField('이번 주 완료', '완료된 핵심 업무 또는 결정 사항');
  const blockers = textareaField('막힌 일 / 위험 요인', '없으면 비워두세요');
  const nextSteps = textareaField('다음 주 계획', '다음에 진행할 핵심 업무');
  form.append(health.wrap, achievements.wrap, blockers.wrap, nextSteps.wrap, button('업데이트 게시', 'primary'));
  form.onsubmit = async event => { event.preventDefault(); try { await saveProjectUpdate({ projectId: project.id, health: health.select.value, achievements: achievements.textarea.value, blockers: blockers.textarea.value, nextSteps: nextSteps.textarea.value }); overlay.remove(); } catch(error) { alert(error.message); } };
  dialog.appendChild(form);
}

function openTimeOffEditor(item){
  const editing = !!item;
  const { overlay, dialog } = openDialog(editing ? '휴가·부재 수정' : '휴가·부재 등록');
  const form = el('form', 'form-grid');
  const eligibleUsers = isAdmin() ? visibleUsers : isLead() ? visibleUsers.filter(user => user.departmentId === currentProfile.departmentId) : [{ id: currentUser.uid, name: currentProfile.name || currentUser.displayName || currentUser.email }];
  const person = selectField('대상자', eligibleUsers.map(user => [user.id, user.name || user.email])); person.select.value = item?.userId || currentUser.uid;
  const type = selectField('구분', [['leave', '휴가'], ['sick', '병가'], ['external', '외근'], ['other', '기타 부재']]); type.select.value = item?.type || 'leave';
  const start = inputField('시작일', '', 'date'); start.input.value = dateOnly(item?.startDate);
  const end = inputField('종료일', '', 'date'); end.input.value = dateOnly(item?.endDate);
  const reason = inputField('메모 (선택)', '예: 연차'); reason.input.value = item?.reason || '';
  const submit = button('저장', 'primary');
  submit.type = 'submit';
  const error = el('p', 'form-error'); error.hidden = true;
  form.append(person.wrap, type.wrap, start.wrap, end.wrap, reason.wrap, error);
  const actions = el('div', 'form-actions'); actions.appendChild(submit);
  if(editing) actions.appendChild(button('삭제', 'danger-button', async () => { if(confirm('이 부재 일정을 삭제할까요?')) { await deleteTimeOff(item.id); overlay.remove(); } }));
  form.appendChild(actions);
  form.onsubmit = async event => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true; submit.textContent = '저장 중…';
    try {
      await saveTimeOff({ ...item, userId: person.select.value, type: type.select.value, startDate: start.input.value, endDate: end.input.value, reason: reason.input.value });
      overlay.remove();
      showToast(editing ? '휴가·부재 일정을 수정했습니다.' : '휴가·부재 일정을 등록했습니다.');
    } catch(cause) {
      error.textContent = `저장하지 못했습니다. ${cause.message || '잠시 후 다시 시도해주세요.'}`;
      error.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = '저장';
    }
  };
  dialog.appendChild(form);
}

function roleFields(roleValue, departmentValue, adminAccess = false){
  const role = selectField('업무 역할', [['member', '팀원'], ['lead', '팀장'], ['pm', 'PM']]); role.select.value = roleValue === 'admin' ? 'pm' : roleValue || 'member';
  const department = selectField('소속 부서', DEPARTMENTS.map(item => [item.id, item.name])); department.select.value = departmentValue || DEPARTMENTS[0].id;
  const admin = el('label', 'permission-toggle');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = adminAccess || roleValue === 'admin';
  admin.append(checkbox, el('span', '', '관리자 권한'), el('small', '', '시스템 전체 관리 권한'));
  const sync = () => { department.wrap.hidden = role.select.value === 'pm'; };
  role.select.onchange = sync; sync();
  return { role, department, admin: { wrap: admin, checkbox } };
}

function openApprovalEditor(request){
  const { overlay, dialog } = openDialog('사용자 승인 및 배정');
  dialog.append(el('p', 'sub', `${request.name || '이름 미지정'} · ${request.email || '이메일 없음'}`));
  const form = el('form', 'form-grid'); const fields = roleFields('member', '');
  form.append(fields.role.wrap, fields.department.wrap, fields.admin.wrap, button('승인', 'primary'));
  form.onsubmit = async event => { event.preventDefault(); try { await approveAccessRequest(request.id, fields.role.select.value, fields.department.select.value, fields.admin.checkbox.checked); overlay.remove(); } catch(error) { alert(error.message); } };
  dialog.appendChild(form);
}

function openUserRoleEditor(user){
  const { overlay, dialog } = openDialog('사용자 권한 수정');
  dialog.append(el('p', 'sub', `${user.name || '이름 미지정'} · ${user.email || '이메일 없음'}`));
  const form = el('form', 'form-grid'); const fields = roleFields(user.role, user.departmentId, user.isAdmin);
  form.append(fields.role.wrap, fields.department.wrap, fields.admin.wrap, button('저장', 'primary'));
  form.onsubmit = async event => { event.preventDefault(); try { await saveUserRole(user.id, fields.role.select.value, fields.department.select.value, fields.admin.checkbox.checked); overlay.remove(); } catch(error) { alert(error.message); } };
  dialog.appendChild(form);
}

function rerender(){
  const main = document.getElementById('main');
  if(!main || !authResolved) return;
  main.innerHTML = '';
  renderAccountActions();
  if(!currentUser) { loginScreen(main); return; }
  if(!currentProfile || !isApproved()) { pendingScreen(main); return; }
  if(activeView === 'home') { renderHome(main); return; }
  renderHomeBack(main);
  if(activeView === 'work') renderWork(main); else renderProjects(main);
}

