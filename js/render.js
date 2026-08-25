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
function fmtDate(value){ return dateOnly(value) || '일정 미정'; }
function statusClass(status){ return status === 'done' ? 'ok' : status === 'blocked' ? 'danger' : status === 'in_progress' ? 'accent' : 'neutral'; }
function healthLabel(health){ return { on_track: '정상', at_risk: '주의', off_track: '위험' }[health] || '미설정'; }
function healthClass(health){ return health === 'on_track' ? 'ok' : health === 'at_risk' ? 'warn' : health === 'off_track' ? 'danger' : 'neutral'; }
function userName(uid){
  if(uid === currentUser?.uid) return currentProfile?.name || currentUser?.displayName || '나';
  return visibleUsers.find(user => user.id === uid)?.name || '담당자 미확인';
}
function taskAssigneeName(task){ return task?.assigneeName || userName(task?.assigneeId); }

function scheduleStatus(task){
  if(task.status === 'done') {
    const completed = dateOnly(task.completedAt);
    return { label: completed && task.dueDate && completed > dateOnly(task.dueDate) ? '완료 지연' : '완료', tone: 'ok' };
  }
  if(task.status === 'blocked') return { label: '일정 차단', tone: 'danger' };
  if(taskIsOverdue(task)) return { label: '일정 지연', tone: 'danger' };
  const today = dateKey(new Date());
  if(task.dueDate && task.dueDate <= addBusinessDays(today, 3)) return { label: '마감 임박', tone: 'warn' };
  return { label: '일정 정상', tone: 'ok' };
}
function projectCode(task){
  const project = projects.find(item => item.id === task?.projectId);
  const base = project?.code || project?.name || '미연결 프로젝트';
  const suffix = task?.platform === 'mobile' ? 'M' : task?.platform === 'console' ? 'C' : '';
  return `${base}${suffix}`;
}
function setView(view, projectId = null){ activeView = view; selectedProjectId = projectId; rerender(); }

function renderPrimaryNavigation(){
  const nav = document.getElementById('primaryNav');
  if(!nav) return;
  nav.innerHTML = '';
  if(!currentProfile) return;
  const entries = [{ id: 'my-work', label: '내 업무' }];
  entries.push({ id: 'projects', label: '프로젝트' });
  if(isLead() || isPM() || isAdmin()) entries.push({ id: 'people', label: '인력 현황' });
  entries.forEach(entry => nav.appendChild(button(entry.label, activeView === entry.id ? 'nav-link active' : 'nav-link', () => setView(entry.id))));
}

function renderAccountActions(){
  const target = document.getElementById('accountActions');
  // GitHub Pages에 남아 있는 이전 index.html을 열었더라도 본문 렌더링까지 멈추지 않게 합니다.
  if(!target) return;
  target.innerHTML = '';
  if(currentUser){
    if(currentProfile) target.append(el('span', 'account-name', `${currentProfile.name || currentUser.displayName || ''} · ${userRoleLabel(currentProfile)}`));
    const profile = el('span', 'account-chip', (currentProfile?.name || currentUser.displayName || currentUser.email || '?').slice(0, 1).toUpperCase());
    profile.title = currentUser.email || '';
    target.append(profile);
    if(isAdmin()) target.appendChild(button('사용자 관리', 'tiny ghost', () => setView('admin')));
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
  const work = button('', 'workspace-card work-workspace', () => open('my-work'));
  work.append(el('span', 'workspace-icon', '✓'), el('span', 'workspace-type', 'MY WORKSPACE'), el('strong', '', '내 업무'), el('span', 'workspace-copy', '오늘과 이번 주 해야 할 업무를 한 줄 단위로 관리합니다.'), el('span', 'workspace-action', '내 업무 보기  →'));
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

function normalizedScheduleTitle(value){ return String(value || '').toLowerCase().replace(/[\s·:()\-_/]/g, ''); }
function isExactDeliveryTitle(value, type){
  const title = normalizedScheduleTitle(value);
  const labels = type === 'full_release' ? ['완전판출시', '완전판런칭', '정식출시', '정식런칭', 'fullrelease', 'fulllaunch'] : type === 'demo_release' ? ['데모출시', '데모런칭', 'demorelease', 'demolaunch'] : type === 'full_build' ? ['완전판빌드', '정식빌드', 'fullbuild'] : ['데모빌드', 'demobuild'];
  return labels.some(label => title === label || title === `${label}날짜`);
}
function deliveryType(item){
  if(DELIVERY_MILESTONES.some(definition => definition.key === item.anchorKey)) return item.anchorKey;
  return ['demo_build', 'demo_release', 'full_build', 'full_release'].find(type => isExactDeliveryTitle(item.title, type)) || null;
}
function projectPlatforms(project){
  const values = [...(project.platforms || []), ...(project.versions || []), ...tasksForProject(project.id).map(task => task.platform), ...milestonesForProject(project.id).map(item => item.version)];
  return [...new Set(values.filter(Boolean))];
}
function uniqueProjectTasks(projectId){
  const keys = new Set();
  return tasksForProject(projectId).filter(task => {
    const key = [task.platform || 'common', normalizedScheduleTitle(task.title), dateOnly(task.startDate), dateOnly(task.dueDate)].join('|');
    if(keys.has(key)) return false;
    keys.add(key); return true;
  });
}
function projectDeliveryEntries(project){
  const entries = [];
  milestonesForProject(project.id).forEach(item => {
    const type = deliveryType(item);
    if(type && item.dueDate) entries.push({ project, source: item, type, platform: item.version || null, date: dateOnly(item.dueDate), title: DELIVERY_MILESTONES.find(definition => definition.key === type)?.title || item.title });
  });
  uniqueProjectTasks(project.id).forEach(task => {
    const type = deliveryType(task);
    if(type && task.dueDate) entries.push({ project, source: task, type, platform: task.platform || null, date: dateOnly(task.dueDate), title: DELIVERY_MILESTONES.find(definition => definition.key === type)?.title || task.title });
  });
  const keys = new Set();
  return entries.filter(entry => {
    const key = [entry.type, entry.platform || 'common', entry.date].join('|');
    if(keys.has(key)) return false;
    keys.add(key); return true;
  });
}
function projectReleaseDates(project){
  const releases = new Map();
  projectDeliveryEntries(project).filter(entry => entry.type === 'full_release').forEach(entry => {
    const platform = entry.platform || 'common';
    const current = releases.get(platform);
    if(!current || entry.date > current) releases.set(platform, entry.date);
  });
  if(!releases.size && project.releaseDate) releases.set('common', dateOnly(project.releaseDate));
  return releases;
}
function projectFinalReleaseDate(project){
  const dates = [...projectReleaseDates(project).values()].filter(Boolean);
  return dates.length ? dates.sort().at(-1) : null;
}
function projectIsCompleted(project){
  if(project.status === 'completed') return true;
  const platforms = projectPlatforms(project);
  const releases = projectReleaseDates(project);
  return platforms.length > 0 && platforms.every(platform => {
    const releaseDate = releases.get(platform) || releases.get('common');
    return Boolean(releaseDate && releaseDate < dateKey(todayDate()));
  });
}

function projectCard(project){
  const list = uniqueProjectTasks(project.id);
  const done = list.filter(task => task.status === 'done').length;
  const overdue = list.filter(taskIsOverdue).length;
  const deadlines = list.filter(task => task.status !== 'done' && task.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const projectProgressValue = list.length ? Math.round(list.reduce((sum, task) => sum + Number(task.progress || 0), 0) / list.length) : 0;
  const card = el('article', 'proj-card');
  card.tabIndex = 0;
  const open = () => { selectedProjectId = project.id; projectScheduleCursor = null; projectDetailTab = 'schedule'; rerender(); };
  card.onclick = open;
  card.onkeydown = event => { if(event.key === 'Enter' || event.key === ' ') open(); };
  const cardHead = el('div', 'project-card-head');
  const title = el('div', 'proj-card-code', project.code || project.name);
  cardHead.append(title, projectIsCompleted(project) ? el('span', 'tag ok', '완료') : el('span', `tag ${healthClass(project.health)}`, healthLabel(project.health)));
  card.append(cardHead);
  if(project.code) card.append(el('div', 'proj-card-name', project.name));
  const releases = projectReleaseDates(project);
  const platforms = projectPlatforms(project);
  if(platforms.length) {
    const platformStates = el('div', 'project-platform-states');
    platforms.forEach(platform => {
      const releaseDate = releases.get(platform) || releases.get('common');
      const completed = releaseDate && releaseDate < dateKey(todayDate());
      platformStates.append(el('span', completed ? 'project-platform-state done' : 'project-platform-state', `${platformName(platform)} · ${completed ? '출시 완료' : releaseDate ? fmtDate(releaseDate) : '출시일 미정'}`));
    });
    card.appendChild(platformStates);
  }
  if(platforms.length) {
    const platformProgress = el('div', 'project-platform-progress');
    platforms.forEach(platform => {
      const platformTasks = list.filter(task => task.platform === platform || (!task.platform && platforms.length === 1));
      const progress = platformTasks.length ? Math.round(platformTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / platformTasks.length) : 0;
      const row = el('div', 'platform-progress-row');
      const track = el('div', 'platform-progress-track'); const fill = el('span', ''); fill.style.width = `${progress}%`; track.appendChild(fill);
      row.append(el('strong', '', platformName(platform)), track, el('span', '', `${progress}%`));
      platformProgress.appendChild(row);
    });
    card.appendChild(platformProgress);
  }
  const progressHead = el('div', 'proj-progress-head'); progressHead.append(el('span', '', '진행률'), el('strong', '', `${projectProgressValue}%`));
  const track = el('div', 'proj-progress-track'); const fill = el('div', 'proj-progress-fill'); fill.style.width = `${projectProgressValue}%`; track.appendChild(fill);
  card.append(progressHead, track);
  const summary = el('div', 'proj-card-summary'); summary.append(el('strong', '', `${done}`), el('span', '', `완료 / 전체 ${list.length}건`)); card.appendChild(summary);
  if(deadlines[0]) {
    const deadline = el('div', `project-deadline ${taskIsOverdue(deadlines[0]) ? 'deadline-overdue' : ''}`);
    const copy = el('div', 'deadline-copy'); copy.append(el('span', 'deadline-label', '다음 마감'), el('strong', '', deadlines[0].title));
    deadline.append(copy, el('time', 'deadline-date', fmtDate(deadlines[0].dueDate))); card.appendChild(deadline);
  } else card.append(el('div', 'project-deadline empty-deadline', '예정된 마감이 없습니다.'));
  if(overdue) card.append(el('div', 'warning-text', `지연 업무 ${overdue}건`));
  return card;
}

function metric(label, value, tone){ const node = el('div', `metric-card ${tone || ''}`); const valueNode = el('strong', `metric-value ${String(value).length > 11 ? 'metric-value-copy' : ''}`, String(value)); node.append(el('span', 'metric-label', label), valueNode); return node; }

function renderProjects(main){
  if(selectedProjectId) {
    renderProjectDetail(main, projects.find(project => project.id === selectedProjectId));
    return;
  }
  const activeProjects = projects.filter(project => project.status !== 'archived' && !projectIsCompleted(project));
  const completedProjects = projects.filter(project => project.status !== 'archived' && projectIsCompleted(project));
  let projectActions = null;
  if(canManageProjects()) {
    projectActions = el('div', 'project-list-actions');
    projectActions.append(button('엑셀 이관', 'tiny ghost', openImportEditor), button('+ 프로젝트 추가', 'primary', () => openProjectCreator()));
  }
  if(!projects.length) {
    main.appendChild(el('div', 'empty', '등록된 프로젝트가 없습니다. 관리자가 첫 프로젝트를 만들어주세요.'));
    return;
  }
  let completed = null;
  if(completedProjects.length) {
    completed = el('details', 'completed-project-group');
    const summary = el('summary', ''); summary.append(el('strong', '', '완료 프로젝트 보기'), el('span', '', `${completedProjects.length}건`));
    completed.appendChild(summary);
    const completedGrid = el('div', 'proj-card-grid completed-project-grid');
    completedProjects.sort((a, b) => String(projectFinalReleaseDate(b) || '').localeCompare(String(projectFinalReleaseDate(a) || ''))).forEach(project => completedGrid.appendChild(projectCard(project)));
    completed.appendChild(completedGrid);
  }
  const dashboard = el('div', 'project-dashboard-grid');
  const calendarPanel = el('section', 'project-milestone-panel');
  renderProjectMilestoneCalendar(calendarPanel, activeProjects);
  const projectPanel = el('section', 'project-dashboard-projects');
  const projectHead = el('div', 'project-dashboard-projects-head');
  projectHead.append(el('h2', '', '프로젝트 현황'));
  if(projectActions) projectHead.appendChild(projectActions);
  const ongoingHead = el('div', 'project-status-subhead');
  ongoingHead.append(el('strong', '', '진행 프로젝트'), el('span', '', `${activeProjects.length}건`));
  const grid = el('div', 'proj-card-grid');
  activeProjects.sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || ''), undefined, { numeric: true })).forEach(project => grid.appendChild(projectCard(project)));
  projectPanel.append(projectHead);
  if(completed) projectPanel.appendChild(completed);
  projectPanel.append(ongoingHead, grid);
  dashboard.append(calendarPanel, projectPanel);
  main.appendChild(dashboard);
}

function projectKeyMilestones(project){
  return projectDeliveryEntries(project).map(entry => ({ project, milestone: { ...entry.source, anchorKey: entry.type, title: entry.title, version: entry.platform }, date: entry.date, platform: entry.platform }));
}

function openProjectMilestonePopover(anchor, date, entries){
  document.querySelectorAll('.project-milestone-popover').forEach(node => node.remove());
  const popover = el('section', 'project-milestone-popover');
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const head = el('div', 'project-milestone-popover-head');
  const close = button('×', 'tiny ghost', () => popover.remove()); close.setAttribute('aria-label', '닫기');
  head.append(el('strong', '', `${dateKey(date)} (${weekday})`), close); popover.appendChild(head);
  const list = el('div', 'project-milestone-popover-list');
  if(!entries.length) list.appendChild(el('p', 'foot-note', '등록된 주요 프로젝트 일정이 없습니다.'));
  entries.forEach(entry => {
    const item = button('', 'project-milestone-popover-item', () => { popover.remove(); activeView = 'projects'; selectedProjectId = entry.project.id; projectDetailTab = 'milestones'; rerender(); });
    item.append(el('strong', '', `${entry.project.code || entry.project.name} · ${entry.platform ? platformName(entry.platform) + ' · ' : ''}${entry.milestone.title}`), el('span', '', entry.project.name || '프로젝트'));
    list.appendChild(item);
  });
  popover.appendChild(list); document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect(), width = Math.min(340, window.innerWidth - 24);
  popover.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  popover.style.top = `${rect.bottom + 8 + popover.offsetHeight > window.innerHeight ? Math.max(12, rect.top - popover.offsetHeight - 8) : rect.bottom + 8}px`;
  const closeOutside = event => { if(!popover.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) { popover.remove(); document.removeEventListener('pointerdown', closeOutside, true); } };
  setTimeout(() => document.addEventListener('pointerdown', closeOutside, true), 0);
}

function renderProjectMilestoneCalendar(panel, activeProjects){
  const year = projectPortfolioCursor.getFullYear(), month = projectPortfolioCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate();
  const entries = activeProjects.flatMap(projectKeyMilestones);
  const head = el('div', 'project-milestone-month-bar');
  const controls = el('div', 'availability-controls');
  controls.append(button('◀', 'tiny ghost', () => { projectPortfolioCursor.setMonth(projectPortfolioCursor.getMonth() - 1); rerender(); }), el('strong', '', `${year}년 ${month + 1}월`), button('▶', 'tiny ghost', () => { projectPortfolioCursor.setMonth(projectPortfolioCursor.getMonth() + 1); rerender(); }));
  head.appendChild(controls); panel.appendChild(head);
  const grid = el('div', 'project-milestone-calendar');
  ['일', '월', '화', '수', '목', '금', '토'].forEach(label => grid.appendChild(el('div', 'project-milestone-dow', label)));
  for(let index = 0; index < firstDay; index++) grid.appendChild(el('div', 'project-milestone-cell muted-cell'));
  for(let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month, day), key = dateKey(date), items = entries.filter(entry => entry.date === key);
    const cell = button('', `project-milestone-cell ${key === dateKey(todayDate()) ? 'today' : ''} ${isHoliday(date) ? 'holiday' : ''}`, () => openProjectMilestonePopover(cell, date, items));
    cell.appendChild(el('strong', 'project-milestone-date', String(day)));
    items.slice(0, 2).forEach(entry => cell.appendChild(el('span', `project-milestone-chip ${entry.milestone.anchorKey || ''}`, `${entry.project.code || entry.project.name} · ${entry.platform ? platformName(entry.platform) + ' · ' : ''}${entry.milestone.title}`)));
    if(items.length > 2) cell.appendChild(el('span', 'project-milestone-more', `+${items.length - 2}`));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
}

function taskRow(task, showProject, mineCompact = false){
  const row = el('article', `task-row ${taskIsOverdue(task) ? 'overdue' : ''}`);
  const body = el('div', 'task-main');
  body.append(el('strong', 'task-title', task.title));
  const meta = [];
  if(showProject) meta.push(projectCode(task));
  if(!mineCompact) {
    if(task.platform) meta.push(platformName(task.platform));
    meta.push(departmentName(task.departmentId), taskAssigneeName(task));
  }
  if(task.startDate || task.dueDate) meta.push(`${fmtDate(task.startDate)} ~ ${fmtDate(task.dueDate)}`);
  const milestone = milestones.find(item => item.id === task.milestoneId);
  if(milestone) meta.push(`마일스톤: ${milestone.title}`);
  const dependencies = taskDependencies(task);
  if(dependencies.length) meta.push(`선행: ${dependencies.map(item => item.title).join(', ')}`);
  body.append(el('div', 'task-meta', meta.join(' · ')));
  row.appendChild(body);
  const state = el('div', 'task-state');
  const schedule = scheduleStatus(task);
  if(task.status === 'done') state.appendChild(el('span', 'tag ok', '완료'));
  if(task.status === 'blocked') state.appendChild(el('span', 'tag danger', '차단됨'));
  if(task.status !== 'done' && task.status !== 'blocked' && taskIsOverdue(task)) state.appendChild(el('span', 'tag danger', schedule.label));
  const progress = el('div', 'task-progress-meter');
  progress.title = `진척 ${task.progress}%`;
  progress.setAttribute('aria-label', `진척 ${task.progress}%`);
  const track = el('span', 'task-progress-track');
  const fill = el('span', `task-progress-fill ${task.progress >= 100 ? 'done' : task.progress > 0 ? 'active' : ''}`);
  fill.style.width = `${Math.max(0, Math.min(100, Number(task.progress) || 0))}%`;
  track.appendChild(fill);
  progress.append(track, el('span', 'task-progress-value', `${task.progress}%`));
  state.appendChild(progress);
  if(taskHasUnfinishedDependencies(task)) state.appendChild(el('span', 'tag warn', '선행 대기'));
  row.appendChild(state);
  if(canEditTask(task)) {
    const actions = el('div', 'task-actions');
    if(task.status !== 'done') actions.appendChild(button('✓ 완료', 'tiny complete-task-button', async () => {
      try { await completeTask(task.id); showToast('업무를 완료 처리했습니다.'); }
      catch(error) { showToast(error.message, 'error'); }
    }));
    if(task.status !== 'done' && canManageTaskAssignment(task)) actions.appendChild(button('이관', 'tiny ghost handover-task-button', () => openAssignmentEditor(task)));
    actions.appendChild(button('수정', 'tiny edit-task-button', () => openTaskEditor(task)));
    row.appendChild(actions);
  }
  return row;
}

function projectCommandCenter(project, projectTasks){
  const today = dateKey(new Date());
  const upcomingMilestone = milestonesForProject(project.id).filter(item => item.status !== 'done' && item.dueDate && item.dueDate >= today).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  const upcomingTask = projectTasks.filter(task => task.status !== 'done' && task.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  const riskTasks = projectTasks.filter(task => taskIsOverdue(task) || task.status === 'blocked' || !task.assigneeId);
  const staffingGaps = (project.platforms || []).flatMap(platform => TEMPLATE_DEPARTMENTS.filter(departmentId => !staffingFor(project, platform, departmentId)?.userId).map(departmentId => ({ platform, departmentId })));
  const section = el('section', 'project-brief-bar');
  const addFact = (label, title, detail, tone, onClick) => {
    const fact = button('', `project-brief-item ${tone || ''}`, onClick);
    fact.append(el('span', 'project-brief-label', label), el('strong', '', title), el('span', '', detail)); section.appendChild(fact);
  };
  if(upcomingMilestone) addFact('다음 마일스톤', upcomingMilestone.title, fmtDate(upcomingMilestone.dueDate), upcomingMilestone.dueDate <= addBusinessDays(today, 7) ? 'warn' : '', () => { projectDetailTab = 'milestones'; rerender(); });
  if(upcomingTask) addFact('다음 마감', upcomingTask.title, `${fmtDate(upcomingTask.dueDate)} · ${taskAssigneeName(upcomingTask)}`, taskIsOverdue(upcomingTask) ? 'danger' : '', () => { projectDetailTab = 'tasks'; rerender(); });
  if(riskTasks.length) addFact('확인 필요', `${riskTasks.length}건`, `지연 ${projectTasks.filter(taskIsOverdue).length} · 차단 ${projectTasks.filter(task => task.status === 'blocked').length} · 미배정 ${projectTasks.filter(task => !task.assigneeId).length}`, 'danger', () => { projectDetailTab = 'tasks'; rerender(); });
  if(staffingGaps.length) addFact('담당자 공백', `${staffingGaps.length}건`, staffingGaps.slice(0, 2).map(item => `${platformName(item.platform)} ${departmentName(item.departmentId)}`).join(' · '), 'warn', () => openProjectEditor(project));
  return section;
}

function renderProjectDetail(main, project){
  if(!project) { selectedProjectId = null; rerender(); return; }
  main.appendChild(button('← 전체 프로젝트', 'tiny ghost', () => { selectedProjectId = null; projectTimelineFilter = 'all'; projectScheduleCursor = null; projectScheduleSelectedDate = null; rerender(); }));

  const hero = el('section', 'panel project-hero');
  const overview = el('div', 'project-hero-overview');
  const overviewHead = el('div', 'project-hero-overview-head');
  const overviewTitle = el('div', 'project-hero-title');
  overviewTitle.append(el('h2', '', project.code || project.name));
  overviewHead.appendChild(overviewTitle);
  let heroActions = null;
  if(canManageProjects() || isLead()) {
    heroActions = el('div', 'project-hero-actions');
    if(canManageProjects()) heroActions.appendChild(button('프로젝트 정보 수정', 'tiny ghost', () => openProjectEditor(project)));
    if(canManageProjects()) heroActions.appendChild(button(project.status === 'completed' ? '프로젝트 재개' : '프로젝트 완료', project.status === 'completed' ? 'tiny ghost' : 'tiny complete-project-button', async () => {
      try {
        if(project.status === 'completed') {
          if(!confirm('이 프로젝트를 다시 진행 상태로 바꿀까요?')) return;
          await reopenProject(project.id); showToast('프로젝트를 다시 진행 상태로 전환했습니다.');
        } else {
          if(!confirm('모든 업무가 완료되었는지 확인했습니다. 프로젝트를 완료 처리할까요?')) return;
          await completeProject(project.id); showToast('프로젝트를 완료 처리했습니다.');
        }
      } catch(error) { showToast(error.message, 'error'); }
    }));
    if(canManageProjects() && project.schedulingMode === 'template') heroActions.appendChild(button('일정 재계산', 'tiny ghost', async () => {
      try { await rescheduleGeneratedTasks(project.id); showToast('고정 마일스톤 기준으로 자동 업무 일정을 다시 계산했습니다.'); }
      catch(error) { showToast(error.message, 'error'); }
    }));
    heroActions.appendChild(button('+ 주간 업데이트', 'tiny ghost', () => openProjectUpdateEditor(project)));
  }
  overview.appendChild(overviewHead);
  if(project.code) overview.append(el('p', 'sub', project.name));
  if(project.platforms?.length) {
    const platforms = el('div', 'project-detail-platforms');
    platforms.append(...project.platforms.map(platform => el('span', '', platformName(platform))));
    overview.appendChild(platforms);
  }
  overview.append(progressBlock(projectProgress(project.id)));
  overview.append(el('span', `tag ${healthClass(project.health)}`, healthLabel(project.health)));
  hero.appendChild(overview);
  const staffing = el('aside', 'project-header-staffing');
  if(heroActions) staffing.appendChild(heroActions);
  (project.platforms || []).forEach(platform => {
    const row = el('div', 'project-header-staffing-row'); row.appendChild(el('strong', '', platformName(platform)));
    const members = (project.staffing || []).filter(item => item.platform === platform && item.userId);
    if(!members.length) row.appendChild(el('span', 'project-staff-chip empty', '미배정'));
    members.forEach(item => { const chip = el('span', 'project-staff-chip'); chip.append(el('small', '', departmentName(item.departmentId)), document.createTextNode(userName(item.userId))); row.appendChild(chip); });
    staffing.appendChild(row);
  });
  hero.appendChild(staffing);
  main.appendChild(hero);
  const projectTasks = tasksForProject(project.id);
  const tabs = el('nav', 'project-detail-tabs');
  const entries = [['schedule', '일정 조율'], ['tasks', `전체 업무 ${projectTasks.length}`], ['milestones', `마일스톤 ${milestonesForProject(project.id).length}`]];
  if(isPM() || isAdmin()) entries.push(['history', '변경 이력']);
  entries.forEach(([id, label]) => tabs.appendChild(button(label, projectDetailTab === id ? 'primary tiny' : 'ghost tiny', () => { projectDetailTab = id; rerender(); })));
  main.appendChild(tabs);
  if(projectDetailTab === 'tasks') renderProjectTaskList(main, project);
  else if(projectDetailTab === 'milestones') renderProjectMilestoneList(main, project);
  else if(projectDetailTab === 'history') renderProjectHistory(main, project);
  else renderProjectSchedule(main, project);
}

const PROJECT_DELIVERY_STAGES = [
  { id: 'preparation', title: '준비' },
  { id: 'production', title: '영상 & 개발' },
  { id: 'demo_launch', title: '데모 런칭 준비' },
  { id: 'full_launch', title: '완전판 런칭 준비' },
  { id: 'other', title: '기타' }
];

function projectDeliveryStage(task){
  const text = `${task?.milestoneStage || ''} ${task?.taskGroup || ''} ${task?.title || ''}`.replace(/\s/g, '').toLowerCase();
  if(/완전판|정식출시|정식런칭|스토어런칭/.test(text)) return 'full_launch';
  if(/데모|심사|출시/.test(text)) return 'demo_launch';
  if(/영상|개발|프리랩|bm|리뷰보드|제작/.test(text) || ['development', 'video'].includes(task?.departmentId)) return 'production';
  if(/준비|기획|아이디어|사전|리소스|현장/.test(text)) return 'preparation';
  return 'other';
}

function renderProjectTaskList(main, project){
  const section = el('section', 'panel project-task-panel');
  const head = el('div', 'project-task-board-head'); head.append(el('h2', '', '업무 현황'), canManageProjects() ? button('+ 업무 추가', 'tiny primary', () => openTaskEditor(null, { projectId: project.id })) : el('span', '', ''));
  section.appendChild(head);
  const filters = el('div', 'project-task-board-filters');
  const stageFilters = el('div', 'project-task-stage-filters');
  const filterState = { value: 'active' };
  const allProjectTasks = tasksForProject(project.id);
  const stageIds = PROJECT_DELIVERY_STAGES.map(stage => stage.id).filter(stageId => allProjectTasks.some(task => projectDeliveryStage(task) === stageId));
  const stageState = { value: stageIds.find(stageId => allProjectTasks.some(task => projectDeliveryStage(task) === stageId && task.status !== 'done')) || stageIds[0] || 'other' };
  const list = el('div', 'project-task-board');
  const layout = el('div', 'project-task-layout');
  const calendar = el('aside', 'project-task-calendar');
  let calendarTasks = [];
  const drawCalendar = stageTasks => {
    if(stageTasks) calendarTasks = stageTasks;
    calendar.innerHTML = '';
    const cursor = projectScheduleCursor || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const nav = el('div', 'project-task-calendar-nav');
    nav.append(button('◀', 'tiny ghost', () => { projectScheduleCursor = new Date(year, month - 1, 1); drawCalendar(); }), el('strong', '', `${year}년 ${month + 1}월`), button('▶', 'tiny ghost', () => { projectScheduleCursor = new Date(year, month + 1, 1); drawCalendar(); }));
    calendar.appendChild(nav);
    const grid = el('div', 'project-task-calendar-grid');
    ['일', '월', '화', '수', '목', '금', '토'].forEach(day => grid.appendChild(el('span', 'project-task-calendar-dow', day)));
    const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate();
    for(let index = 0; index < firstDay; index++) grid.appendChild(el('span', 'project-task-calendar-cell muted'));
    for(let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day), key = dateKey(date);
      const count = calendarTasks.filter(task => taskCoversDate(task, date) && task.status !== 'done').length;
      const milestoneCount = milestonesForProject(project.id).filter(item => item.dueDate === key).length;
      const cell = button('', `project-task-calendar-cell ${key === dateKey(todayDate()) ? 'today' : ''} ${count ? 'has-work' : ''}`, () => { projectScheduleSelectedDate = key; projectDetailTab = 'schedule'; rerender(); });
      cell.append(el('strong', '', String(day)));
      if(count) cell.appendChild(el('span', '', `${count}건`));
      else if(milestoneCount) cell.appendChild(el('span', 'milestone', '일정'));
      grid.appendChild(cell);
    }
    calendar.appendChild(grid);
    calendar.appendChild(el('p', 'foot-note', '날짜를 누르면 일정 조율에서 상세 업무를 확인합니다.'));
  };
  const moveCalendarToStageStart = stageTasks => {
    const first = stageTasks.map(task => task.startDate || task.dueDate).filter(Boolean).sort()[0];
    if(first) { const date = localDate(first); projectScheduleCursor = new Date(date.getFullYear(), date.getMonth(), 1); }
  };
  const draw = () => {
    list.innerHTML = '';
    const stageTasks = allProjectTasks.filter(task => projectDeliveryStage(task) === stageState.value);
    drawCalendar(stageTasks);
    const items = stageTasks.filter(task => filterState.value === 'all' || (filterState.value === 'risk' ? (taskIsOverdue(task) || task.status === 'blocked' || !task.assigneeId) : task.status !== 'done'));
    if(!items.length) list.appendChild(el('div', 'empty', '표시할 업무가 없습니다.'));
    else {
      const order = ['development', 'ui', 'planning', 'studio', 'qa', 'business', 'video', 'server', 'pm'];
      const departmentIds = [...new Set(items.map(task => task.departmentId || 'other'))].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || departmentName(a).localeCompare(departmentName(b)));
      departmentIds.forEach(departmentId => {
        const departmentTasks = items.filter(task => (task.departmentId || 'other') === departmentId).sort((a, b) => String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')));
        const column = el('section', 'project-task-board-column');
        const columnHead = el('div', 'project-task-board-column-head'); columnHead.append(el('h3', '', departmentName(departmentId)), el('span', '', `${departmentTasks.length}`));
        const cards = el('div', 'project-task-board-cards');
        departmentTasks.forEach(task => {
          const risk = taskIsOverdue(task) || task.status === 'blocked' || !task.assigneeId;
          const card = el('article', `project-task-board-card ${risk ? 'danger' : ''} ${task.status === 'done' ? 'done' : ''}`);
          if(canEditTask(task)) { card.tabIndex = 0; card.onclick = () => openTaskEditor(task); card.onkeydown = event => { if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTaskEditor(task); } }; }
          const cardHead = el('div', 'project-task-board-card-head');
          cardHead.append(el('strong', '', task.title), el('span', `tag ${risk ? 'danger' : task.status === 'done' ? 'ok' : 'neutral'}`, task.status === 'done' ? '완료' : task.status === 'blocked' ? '차단' : `${task.progress || 0}%`));
          const meta = [task.platform ? platformName(task.platform) : '', taskAssigneeName(task), task.dueDate ? `${fmtDate(task.dueDate)}까지` : '일정 미정'].filter(Boolean).join(' · ');
          card.append(cardHead, el('p', 'project-task-board-card-meta', meta)); cards.appendChild(card);
        });
        column.append(columnHead, cards); list.appendChild(column);
      });
    }
  };
  [['active','진행 중'], ['risk','확인 필요'], ['all','전체']].forEach(([key, label]) => filters.appendChild(button(label, key === 'active' ? 'primary tiny' : 'ghost tiny', event => { filterState.value = key; [...filters.querySelectorAll('button')].forEach(item => item.className = 'ghost tiny'); event.currentTarget.className = 'primary tiny'; draw(); })));
  stageIds.forEach(stageId => {
    const stage = PROJECT_DELIVERY_STAGES.find(item => item.id === stageId);
    const count = allProjectTasks.filter(task => projectDeliveryStage(task) === stageId && task.status !== 'done').length;
    stageFilters.appendChild(button(`${stage.title} ${count}`, stageId === stageState.value ? 'primary tiny' : 'ghost tiny', event => {
      stageState.value = stageId;
      [...stageFilters.querySelectorAll('button')].forEach(item => item.className = 'ghost tiny'); event.currentTarget.className = 'primary tiny';
      moveCalendarToStageStart(allProjectTasks.filter(task => projectDeliveryStage(task) === stageId)); draw();
    }));
  });
  moveCalendarToStageStart(allProjectTasks.filter(task => projectDeliveryStage(task) === stageState.value));
  layout.append(calendar, list); section.append(filters, stageFilters, layout); draw(); main.appendChild(section);
}

function renderProjectMilestoneList(main, project){
  const section = el('section', 'panel project-task-panel');
  const head = el('div', 'section-title-row'); const copy = el('div', ''); copy.append(el('h2', '', '마일스톤'), el('p', 'sub', '고정 일정과 연결된 업무의 진행 상태를 확인합니다.')); head.append(copy);
  if(canManageProjects()) head.appendChild(button('+ 마일스톤', 'tiny primary', () => openMilestoneEditor(null, project.id))); section.appendChild(head);
  const list = el('div', 'milestone-list');
  const items = milestonesForProject(project.id).sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  if(!items.length) list.appendChild(el('div', 'empty', '등록된 마일스톤이 없습니다.'));
  items.forEach(item => {
    const linked = tasksForMilestone(item.id); const overdue = linked.filter(taskIsOverdue).length;
    const row = el('article', 'milestone-row'); const info = el('div', ''); info.append(el('strong', '', item.title), el('p', 'foot-note', `${fmtDate(item.dueDate)} · 연결 업무 ${linked.length}건${overdue ? ` · 지연 ${overdue}건` : ''}`));
    row.append(info, el('span', `tag ${overdue ? 'danger' : 'ok'}`, overdue ? '위험' : `${milestoneProgress(item.id) ?? 0}%`));
    if(canManageProjects()) row.appendChild(button('수정', 'tiny ghost', () => openMilestoneEditor(item, project.id))); list.appendChild(row);
  });
  section.appendChild(list); main.appendChild(section);
}

function renderProjectHistory(main, project){
  const section = el('section', 'panel project-task-panel'); section.append(el('h2', '', '변경 이력'), el('p', 'sub', '담당자 이관과 과부하 경고 확인 기록입니다.'));
  const list = el('div', 'history-list');
  const items = assignmentHistory.filter(item => item.projectId === project.id).sort((a,b) => timestampMillis(b.changedAt) - timestampMillis(a.changedAt));
  if(!items.length) list.appendChild(el('div', 'empty', '아직 담당자 변경 이력이 없습니다.'));
  items.forEach(item => {
    const row = el('article', 'history-row');
    row.append(el('strong', '', `${item.previousAssigneeName || '미배정'} → ${item.nextAssigneeName || '미배정'}`), el('span', 'foot-note', `${item.changedByName || '사용자'} · ${fmtDate(item.changedAt)}${item.warningLevel === 'danger' ? ' · 과부하 경고 확인' : ''}`)); list.appendChild(row);
  });
  section.appendChild(list); main.appendChild(section);
}

function timelineCategory(entry){
  if(entry.kind === 'milestone') return 'milestone';
  const category = entry.item.workCategory || entry.item.departmentId;
  return ['planning', 'ui', 'development', 'business', 'video', 'studio', 'qa'].includes(category) ? category : 'other';
}

function timelineLabel(category){
  return { all: '전체', milestone: '마일스톤', planning: '기획', ui: 'UI', development: '개발', business: '글비', video: '영상', studio: '제작실', qa: 'QA', other: '기타' }[category] || '기타';
}

function openProjectSchedulePopover(anchor, date, project, dayTasks, dayMilestones){
  document.querySelectorAll('.project-day-popover').forEach(node => node.remove());
  const popover = el('section', 'project-day-popover');
  const close = button('×', 'tiny ghost', () => popover.remove()); close.setAttribute('aria-label', '닫기');
  const head = el('div', 'project-day-popover-head'); head.append(el('strong', '', `${dateKey(date)} 일정`), close); popover.appendChild(head);
  dayMilestones.forEach(item => {
    const milestone = canManageProjects() ? button(item.title, 'project-day-milestone', () => { popover.remove(); openMilestoneEditor(item, project.id); }) : el('div', 'project-day-milestone', item.title);
    popover.appendChild(milestone);
  });
  const groups = new Map(); dayTasks.forEach(task => { const key = task.departmentId || 'other'; if(!groups.has(key)) groups.set(key, []); groups.get(key).push(task); });
  if(!dayTasks.length && !dayMilestones.length) popover.appendChild(el('p', 'foot-note', '등록된 업무가 없습니다.'));
  groups.forEach((tasks, departmentId) => {
    const group = el('section', 'project-day-group'); group.appendChild(el('strong', '', departmentName(departmentId)));
    tasks.forEach(task => {
      const item = canEditTask(task) ? button('', 'project-day-task', () => { popover.remove(); openTaskEditor(task); }) : el('div', 'project-day-task');
      item.append(el('span', '', task.title), el('small', '', `${task.platform ? platformName(task.platform) + ' · ' : ''}${taskAssigneeName(task)}`)); group.appendChild(item);
    });
    popover.appendChild(group);
  });
  document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24);
  popover.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  popover.style.top = `${rect.bottom + 8 + popover.offsetHeight > window.innerHeight ? Math.max(12, rect.top - popover.offsetHeight - 8) : rect.bottom + 8}px`;
  const closeOutside = event => { if(!popover.contains(event.target) && !anchor.contains(event.target)) { popover.remove(); document.removeEventListener('pointerdown', closeOutside, true); } };
  setTimeout(() => document.addEventListener('pointerdown', closeOutside, true), 0);
}

function renderProjectSchedule(main, project){
  const projectTasks = uniqueProjectTasks(project.id);
  const dates = [...projectTasks.flatMap(task => [task.startDate, task.dueDate]), ...milestonesForProject(project.id).map(item => item.dueDate)].filter(Boolean).sort();
  if(!projectScheduleCursor) { const base = localDate(dates[0]) || new Date(); projectScheduleCursor = new Date(base.getFullYear(), base.getMonth(), 1); }
  const cursor = new Date(projectScheduleCursor.getFullYear(), projectScheduleCursor.getMonth(), 1);
  const firstDay = cursor.getDay(), lastDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const todayKey = dateKey(todayDate());
  if(!projectScheduleSelectedDate || !projectScheduleSelectedDate.startsWith(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)) projectScheduleSelectedDate = todayKey.startsWith(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`) ? todayKey : dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const section = el('section', 'panel project-month-schedule');
  if(canManageProjects()) { const actions = el('div', 'project-schedule-actions'); actions.append(button('+ 마일스톤', 'tiny ghost', () => openMilestoneEditor(null, project.id)), button('+ 업무 추가', 'tiny primary', () => openTaskEditor(null, { projectId: project.id }))); section.appendChild(actions); }
  const nav = el('div', 'availability-month-bar'); const controls = el('div', 'availability-controls'); controls.append(button('◀', 'tiny ghost', () => { projectScheduleCursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); rerender(); }), el('strong', '', `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`), button('▶', 'tiny ghost', () => { projectScheduleCursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); rerender(); })); nav.appendChild(controls); section.appendChild(nav);
  const layout = el('div', 'project-schedule-layout'); const calendar = el('div', 'project-month-calendar'); ['일', '월', '화', '수', '목', '금', '토'].forEach(label => calendar.appendChild(el('div', 'project-month-dow', label)));
  for(let index = 0; index < firstDay; index++) calendar.appendChild(el('div', 'project-month-cell muted-cell'));
  for(let day = 1; day <= lastDate; day++) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), day), key = dateKey(date);
    const dayTasks = projectTasks.filter(task => taskCoversDate(task, date)); const dayMilestones = milestonesForProject(project.id).filter(item => item.dueDate === key);
    const cell = button('', `project-month-cell ${key === projectScheduleSelectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''} ${isHoliday(date) ? 'holiday' : ''}`, () => { projectScheduleSelectedDate = key; rerender(); });
    cell.appendChild(el('strong', 'project-month-date', String(day)));
    dayMilestones.slice(0, 1).forEach(item => cell.appendChild(el('span', 'project-month-milestone', item.title)));
    const counts = DEPARTMENTS.map(department => [department, dayTasks.filter(task => task.departmentId === department.id).length]).filter(([, count]) => count);
    counts.slice(0, 3).forEach(([department, count]) => cell.appendChild(el('span', 'project-month-department', `${department.name} ${count}`)));
    if(counts.length > 3) cell.appendChild(el('span', 'project-month-more', `+${counts.length - 3}`));
    calendar.appendChild(cell);
  }
  const selectedDate = localDate(projectScheduleSelectedDate); const selectedTasks = projectTasks.filter(task => taskCoversDate(task, selectedDate)); const selectedMilestones = milestonesForProject(project.id).filter(item => item.dueDate === projectScheduleSelectedDate);
  const detail = el('aside', 'project-schedule-detail'); detail.append(el('strong', '', `${projectScheduleSelectedDate} 상세`));
  selectedMilestones.forEach(item => detail.appendChild(canManageProjects() ? button(item.title, 'project-day-milestone', () => openMilestoneEditor(item, project.id)) : el('div', 'project-day-milestone', item.title)));
  const groups = new Map(); selectedTasks.forEach(task => { const key = task.departmentId || 'other'; if(!groups.has(key)) groups.set(key, []); groups.get(key).push(task); });
  if(!selectedTasks.length && !selectedMilestones.length) detail.appendChild(el('p', 'foot-note', '등록된 업무가 없습니다.'));
  groups.forEach((tasks, departmentId) => { const group = el('section', 'project-day-group'); group.appendChild(el('strong', '', departmentName(departmentId))); tasks.forEach(task => { const item = canEditTask(task) ? button('', 'project-day-task', () => openTaskEditor(task)) : el('div', 'project-day-task'); item.append(el('span', '', task.title), el('small', '', `${task.platform ? platformName(task.platform) + ' · ' : ''}${taskAssigneeName(task)}`)); group.appendChild(item); }); detail.appendChild(group); });
  layout.append(calendar, detail); section.appendChild(layout); main.appendChild(section);
}

function renderWork(main){
  renderWorkDashboard(main, workTasks());
}

function taskAssignedToUser(task, userId){ return task.assigneeId === userId || (task.assignees || []).some(item => item.userId === userId); }

function workTasks(){
  // 이 도구에서는 프로젝트에 연결된 업무만 운영합니다.
  return activeTasks().filter(task => task.projectId && taskAssignedToUser(task, currentUser?.uid));
}

function renderWorkDashboard(main, allTasks){
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const capacityReady = isWorkDataReady();
  const monday = mondayOf(today); const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const todayTasks = allTasks.filter(task => task.status !== 'done' && taskCoversDate(task, today));
  const workingDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(date.getDate() + index); return date; }).filter(isWeekday);
  const weeklyLoadDays = workingDates.reduce((sum, date) => sum + taskLoadForUserOnDate(currentUser.uid, date), 0);
  const weeklyCapacityDays = workingDates.length * userDailyCapacity(currentUser.uid);
  const weeklyLoad = weeklyCapacityDays ? Math.round((weeklyLoadDays / weeklyCapacityDays) * 100) : 0;
  const freeHours = Math.max(0, Math.round((weeklyCapacityDays - weeklyLoadDays) * 8));
  const nextFree = capacityReady ? nextAvailableDate(currentUser.uid) : null;
  const summary = el('section', 'work-summary-bar');
  const summaryItem = (label, value, tone = '') => {
    const item = el('div', `work-summary-item ${tone}`);
    item.append(el('span', '', label), el('strong', '', value));
    return item;
  };
  summary.append(
    summaryItem('오늘 해야 할 일', `${todayTasks.length}건`),
    summaryItem('이번 주 업무량', capacityReady ? `${weeklyLoad}%` : '계산 중', capacityReady && (weeklyLoad > 100 ? 'danger' : weeklyLoad >= 80 ? 'warn' : '')),
    summaryItem('이번 주 남은 여유', capacityReady ? `${freeHours}시간` : '계산 중', capacityReady && freeHours === 0 ? 'warn' : ''),
    summaryItem('다음 여유', capacityReady ? (nextFree ? fmtDate(nextFree) : '확인 필요') : '계산 중')
  );
  main.appendChild(summary);
  const grid = el('div', 'work-dashboard-grid');
  const calendarPanel = el('section', 'work-availability-panel');
  renderWorkAvailabilityCalendar(calendarPanel, allTasks);
  const projectPanel = el('div', 'work-dashboard-projects');
  renderProjectGroupedWork(projectPanel, allTasks, { embedded: true });
  grid.append(calendarPanel, projectPanel); main.appendChild(grid);
}

function renderWorkAvailabilityCalendar(panel, allTasks){
  const year = workCalendarCursor.getFullYear(), month = workCalendarCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(), lastDate = new Date(year, month + 1, 0).getDate();
  const monthWorkingDates = Array.from({ length: lastDate }, (_, index) => new Date(year, month, index + 1)).filter(isWeekday);
  const scheduledDays = monthWorkingDates.filter(date => allTasks.some(task => taskCoversDate(task, date))).length;
  const freeDays = monthWorkingDates.length - scheduledDays;
  const nav = el('div', 'availability-month-bar');
  const controls = el('div', 'availability-controls');
  controls.append(button('◀', 'tiny ghost', () => { workCalendarCursor.setMonth(workCalendarCursor.getMonth() - 1); rerender(); }), el('strong', '', `${workCalendarCursor.getFullYear()}년 ${workCalendarCursor.getMonth() + 1}월`), button('▶', 'tiny ghost', () => { workCalendarCursor.setMonth(workCalendarCursor.getMonth() + 1); rerender(); }));
  nav.appendChild(controls);
  const summary = el('div', 'availability-month-summary');
  [[`근무일`, `${monthWorkingDates.length}일`], ['업무일', `${scheduledDays}일`], ['여유일', `${freeDays}일`]].forEach(([label, value]) => {
    const item = el('div', ''); item.append(el('span', '', label), el('strong', '', value)); summary.appendChild(item);
  });
  panel.append(nav, summary);
  const grid = el('div', 'availability-calendar');
  ['일', '월', '화', '수', '목', '금', '토'].forEach(label => grid.appendChild(el('div', 'availability-dow', label)));
  for(let index = 0; index < firstDay; index++) grid.appendChild(el('div', 'availability-cell muted-cell'));
  for(let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month, day); const key = dateKey(date);
    // 일정 이력은 완료 업무까지 보여주되, 가용 시간 계산에는 진행 업무만 반영합니다.
    const dayTasks = allTasks.filter(task => taskCoversDate(task, date));
    const activeDayTasks = dayTasks.filter(task => task.status !== 'done');
    const completedDayTasks = dayTasks.filter(task => task.status === 'done');
    const loadDays = taskLoadForUserOnDate(currentUser.uid, date);
    const capacityDays = userDailyCapacity(currentUser.uid);
    const load = isWeekday(date) && capacityDays ? Math.round((loadDays / capacityDays) * 100) : 0;
    const freeHours = Math.max(0, Math.round((capacityDays - loadDays) * 8));
    const tone = !isWeekday(date) ? 'off' : load > 100 ? 'over' : load >= 80 ? 'busy' : load > 0 ? 'partial' : 'free';
    const cell = button('', `availability-cell ${tone} ${dateKey(todayDate()) === key ? 'today' : ''}`, () => openCalendarDayPopover(cell, date, dayTasks));
    const dateHead = el('div', 'availability-date'); dateHead.append(el('strong', '', String(day)), el('span', '', dateKey(todayDate()) === key ? '오늘' : isHoliday(date) ? '휴일' : ''));
    cell.appendChild(dateHead);
    if(!isWeekday(date)) cell.appendChild(el('span', 'availability-label', isHoliday(date) ? '공휴일' : '주말'));
    else if(load > 100) cell.appendChild(el('span', 'availability-label', '과부하'));
    else if(!dayTasks.length) cell.appendChild(el('span', 'availability-label', '업무 없음'));
    else if(!activeDayTasks.length) cell.appendChild(el('span', 'availability-label', `완료 ${completedDayTasks.length}건`));
    else cell.appendChild(el('span', 'availability-label', `진행 ${activeDayTasks.length}건${completedDayTasks.length ? ` · 완료 ${completedDayTasks.length}` : ''}`));
    if(isWeekday(date) && activeDayTasks.length) cell.appendChild(el('span', 'availability-free', freeHours ? `여유 ${freeHours}시간` : '여유 없음'));
    else if(isWeekday(date) && !completedDayTasks.length) cell.appendChild(el('span', 'availability-free', `여유 ${Math.round(capacityDays * 8)}시간`));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
}

function openCalendarDayPopover(anchor, date, dayTasks){
  document.querySelectorAll('.availability-day-popover').forEach(node => node.remove());
  const popover = el('section', 'availability-day-popover');
  const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const head = el('div', 'availability-day-popover-head');
  head.append(el('strong', '', `${dateKey(date)} (${weekDay})`));
  const close = button('×', 'tiny ghost', () => popover.remove()); close.setAttribute('aria-label', '닫기'); head.appendChild(close);
  popover.appendChild(head);
  if(isHoliday(date)) popover.appendChild(el('span', 'tag neutral', '공휴일'));
  const list = el('div', 'availability-day-task-list');
  if(!dayTasks.length) list.appendChild(el('p', 'foot-note', '등록된 업무가 없습니다.'));
  dayTasks.slice().sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).forEach(task => {
    const item = button('', 'availability-day-task', () => { popover.remove(); openTaskEditor(task); });
    const meta = [projectCode(task), task.platform ? platformName(task.platform) : '공통', TASK_STATUS[task.status] || '미착수'].join(' · ');
    item.append(el('strong', '', task.title), el('span', '', meta));
    list.appendChild(item);
  });
  popover.appendChild(list);
  document.body.appendChild(popover);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const top = rect.bottom + 8 + popover.offsetHeight > window.innerHeight ? Math.max(12, rect.top - popover.offsetHeight - 8) : rect.bottom + 8;
  popover.style.left = `${left}px`; popover.style.top = `${top}px`;
  const closeWhenOutside = event => { if(!popover.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) { popover.remove(); document.removeEventListener('pointerdown', closeWhenOutside, true); } };
  setTimeout(() => document.addEventListener('pointerdown', closeWhenOutside, true), 0);
}

function todayDate(){ const date = new Date(); date.setHours(0, 0, 0, 0); return date; }

function renderProjectGroupedWork(main, allTasks, options = {}){
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const section = el('section', `work-projects-section ${options.embedded ? 'embedded' : ''}`);
  const head = el('div', 'work-section-head');
  const copy = el('div', '');
  const tabs = el('nav', 'work-project-tabs');
  copy.appendChild(el('h3', '', '프로젝트별 진행 업무'));
  copy.appendChild(tabs);
  const completedProjectToggle = button('완료 프로젝트 보기', 'tiny ghost completed-project-filter');
  const actions = el('div', 'work-section-actions');
  actions.append(completedProjectToggle, button('+ 업무 추가', 'tiny primary work-add-task-button', () => openTaskEditor(null)));
  head.append(copy, actions); section.appendChild(head);
  const panel = el('section', 'work-project-panel');
  section.append(panel); main.appendChild(section);
  let selectedProjectKey = null;
  let selectedPlatform = 'all';
  let selectedPhase = null;
  let showCompletedProjects = false;
  const draw = () => {
    tabs.innerHTML = ''; panel.innerHTML = '';
    const byProject = new Map();
    // 프로젝트에 연결된 업무만 표시합니다.
    allTasks.filter(task => task.projectId).forEach(task => {
      const key = task.projectId;
      if(!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(task);
    });
    // 프로젝트 자체가 완료되었거나, 현재 사용자에게 남은 업무가 전혀 없으면
    // 내 업무 화면에서는 완료 프로젝트로 취급합니다. (기존 이관 프로젝트 호환)
    const isCompletedWorkProject = (projectId, projectTasks) => {
      const project = projects.find(item => item.id === projectId);
      return project?.status === 'completed' || (projectTasks.length > 0 && projectTasks.every(task => task.status === 'done'));
    };
    const entries = [...byProject.entries()]
      .filter(([projectId, projectTasks]) => showCompletedProjects || !isCompletedWorkProject(projectId, projectTasks))
      .sort(([leftId, leftTasks], [rightId, rightTasks]) => {
      const leftActive = leftTasks.filter(task => task.status !== 'done');
      const rightActive = rightTasks.filter(task => task.status !== 'done');
      const leftDate = (leftActive.length ? leftActive : leftTasks).map(task => task.dueDate || task.completedAt || '9999-12-31').sort()[0];
      const rightDate = (rightActive.length ? rightActive : rightTasks).map(task => task.dueDate || task.completedAt || '9999-12-31').sort()[0];
      return String(leftDate).localeCompare(String(rightDate));
    });
    if(!entries.length) {
      tabs.appendChild(el('span', 'foot-note', '표시할 프로젝트 업무가 없습니다.'));
      panel.appendChild(el('div', 'empty compact-empty', '프로젝트에 연결된 업무를 추가하면 이곳에 표시됩니다.'));
      return;
    }
    if(!entries.some(([key]) => key === selectedProjectKey)) selectedProjectKey = (entries.find(([, tasks]) => tasks.some(task => task.status !== 'done' && taskCoversDate(task, today))) || entries.find(([, tasks]) => tasks.some(task => task.status !== 'done')) || entries[0])[0];
    entries.forEach(([projectId, tasks]) => {
      const project = projects.find(item => item.id === projectId);
      const code = project?.code || project?.name || '프로젝트';
      const activeCount = tasks.filter(task => task.status !== 'done').length;
      const todayCount = tasks.filter(task => task.status !== 'done' && taskCoversDate(task, today)).length;
      const tab = button('', projectId === selectedProjectKey ? 'primary tiny' : 'ghost tiny', () => { selectedProjectKey = projectId; selectedPlatform = 'all'; selectedPhase = null; draw(); });
      tab.appendChild(el('strong', '', code));
      if(isCompletedWorkProject(projectId, tasks)) tab.appendChild(el('em', 'completed-project-tab-mark', '완료'));
      if(todayCount) tab.appendChild(el('em', '', `오늘 ${todayCount}`));
      tabs.appendChild(tab);
    });
    const selected = entries.find(([key]) => key === selectedProjectKey);
    const [projectId, tasks] = selected;
    const project = projects.find(item => item.id === projectId);
    const platformIds = [...new Set(tasks.map(task => task.platform).filter(Boolean))];
    if(selectedPlatform !== 'all' && !platformIds.includes(selectedPlatform)) selectedPlatform = 'all';
    if(platformIds.length === 1 && selectedPlatform === 'all') selectedPlatform = platformIds[0];
    const visibleTasks = selectedPlatform === 'all' ? tasks : tasks.filter(task => task.platform === selectedPlatform);
    const phaseIds = PROJECT_TASK_PHASES.map(phase => phase.id).filter(phaseId => visibleTasks.some(task => projectTaskPhase(task).id === phaseId));
    const firstActivePhase = phaseIds.find(phaseId => visibleTasks.some(task => projectTaskPhase(task).id === phaseId && task.status !== 'done'));
    if(!phaseIds.includes(selectedPhase)) selectedPhase = firstActivePhase || phaseIds[0] || 'other';
    const projectTasks = visibleTasks.filter(task => task.status !== 'done' && projectTaskPhase(task).id === selectedPhase).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    const completedTasks = visibleTasks.filter(task => task.status === 'done' && projectTaskPhase(task).id === selectedPhase).sort((a, b) => String(b.completedAt || b.dueDate || '').localeCompare(String(a.completedAt || a.dueDate || '')));
    const panelHead = el('div', 'work-project-panel-head');
    const name = project ? `${project.code || project.name}${project.name && project.code ? ` · ${project.name}` : ''}` : '프로젝트';
    const activeCount = projectTasks.filter(task => task.status !== 'done').length;
    const allProjectTasks = allTasks.filter(task => task.projectId === projectId);
    const completedCount = allProjectTasks.filter(task => task.status === 'done').length;
    const progress = allProjectTasks.length ? Math.round(allProjectTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / allProjectTasks.length) : 0;
    const panelCopy = el('div', '');
    panelCopy.append(el('strong', '', name), el('span', '', `진행 ${activeCount}건 · 완료 ${completedCount}/${allProjectTasks.length} · 진척률 ${progress}%`));
    const progressLine = el('div', 'work-project-progress');
    const progressFill = el('span', ''); progressFill.style.width = `${progress}%`; progressLine.appendChild(progressFill);
    panelCopy.appendChild(progressLine);
    panelHead.appendChild(panelCopy);
    const panelActions = el('div', 'work-project-panel-actions');
    if(platformIds.length) {
      const platformTabs = el('nav', 'work-platform-tabs');
      const platformOptions = platformIds.length > 1 ? [['all', '전체'], ...platformIds.map(id => [id, platformName(id)])] : platformIds.map(id => [id, platformName(id)]);
      platformOptions.forEach(([id, label]) => {
        const filter = button(label, id === selectedPlatform ? 'primary tiny' : 'ghost tiny', () => { selectedPlatform = id; selectedPhase = null; draw(); });
        platformTabs.appendChild(filter);
      });
      panelActions.appendChild(platformTabs);
    }
    if(project) panelActions.appendChild(button('프로젝트 보기 →', 'tiny ghost', () => { activeView = 'projects'; selectedProjectId = project.id; projectDetailTab = 'tasks'; rerender(); }));
    panelHead.appendChild(panelActions);
    panel.appendChild(panelHead);
    const phaseTabs = el('nav', 'work-phase-tabs');
    phaseIds.forEach(phaseId => {
      const phase = PROJECT_TASK_PHASES.find(item => item.id === phaseId);
      const count = visibleTasks.filter(task => task.status !== 'done' && projectTaskPhase(task).id === phaseId).length;
      phaseTabs.appendChild(button(`${phase.title} ${count}`, phaseId === selectedPhase ? 'primary tiny' : 'ghost tiny', () => { selectedPhase = phaseId; draw(); }));
    });
    panel.appendChild(phaseTabs);
    if(completedTasks.length) {
      const completed = el('details', 'completed-task-group');
      const summary = el('summary', '');
      summary.append(el('strong', '', '완료 업무'), el('span', '', `${completedTasks.length}건`));
      completed.appendChild(summary);
      const completedList = el('div', 'task-list compact-task-list work-project-task-grid completed-task-list');
      completedTasks.forEach(task => completedList.appendChild(taskRow(task, false, true)));
      completed.appendChild(completedList);
      panel.appendChild(completed);
    }
    const list = el('div', 'task-list compact-task-list work-project-task-grid');
    if(projectTasks.length) projectTasks.forEach(task => list.appendChild(taskRow(task, false, true)));
    else list.appendChild(el('div', 'empty compact-empty', '진행 중인 업무가 없습니다.'));
    panel.appendChild(list);
  };
  completedProjectToggle.onclick = () => {
    showCompletedProjects = !showCompletedProjects;
    completedProjectToggle.textContent = showCompletedProjects ? '완료 프로젝트 숨기기' : '완료 프로젝트 보기';
    completedProjectToggle.className = showCompletedProjects ? 'tiny primary completed-project-filter' : 'tiny ghost completed-project-filter';
    draw();
    showToast(showCompletedProjects ? '완료 프로젝트를 표시합니다.' : '완료 프로젝트를 숨겼습니다.');
  };
  draw();
}

function filterWorkTasksByPeriod(list, period){
  if(period === 'all') return list;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let start = new Date(today), end = new Date(today);
  if(period === 'week') { start = mondayOf(today); end = new Date(start); end.setDate(start.getDate() + 6); }
  if(period === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); }
  return list.filter(task => {
    const taskStart = localDate(task.startDate || task.dueDate);
    const taskEnd = localDate(task.dueDate || task.startDate);
    if(!taskStart || !taskEnd) return false;
    return taskStart <= end && taskEnd >= start;
  });
}

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
  const assignees = [...new Set(list.flatMap(task => task.assigneeIds || task.assignees?.map(item => item.userId) || [task.assigneeId]).filter(Boolean))];
  const tableWrap = el('div', 'table-wrap panel'); const table = document.createElement('table');
  const thead = document.createElement('thead'); const headRow = document.createElement('tr');
  ['담당자', ...days.map(day => `${day.getMonth() + 1}/${day.getDate()}`), '합계'].forEach(label => headRow.appendChild(el('th', '', label))); thead.appendChild(headRow); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  assignees.forEach(assigneeId => {
    const row = document.createElement('tr'); row.appendChild(el('td', '', userName(assigneeId)));
    let total = 0;
    days.forEach(day => { const load = list.filter(task => taskAssignedToUser(task, assigneeId)).reduce((sum, task) => sum + taskDailyLoad(task, day, assigneeId), 0); total += load; const cell = el('td', load > 1 ? 'capacity-over' : '', `${load.toFixed(1)}일`); row.appendChild(cell); });
    row.appendChild(el('td', total > 5 ? 'capacity-over' : '', `${total.toFixed(1)}일`)); tbody.appendChild(row);
  });
  table.appendChild(tbody); tableWrap.appendChild(table); main.appendChild(tableWrap);
}

function personProjectBadges(userId){
  const related = projects.filter(project => tasksForProject(project.id).some(task => taskAssignedToUser(task, userId)));
  const wrap = el('div', 'project-badges');
  related.slice(0, 3).forEach(project => {
    const active = tasksForProject(project.id).some(task => taskAssignedToUser(task, userId) && task.status !== 'done');
    wrap.append(el('span', active ? 'project-badge active' : 'project-badge', project.code || project.name));
  });
  if(related.length > 3) wrap.append(el('span', 'project-badge', `+${related.length - 3}`));
  return wrap;
}

function userWorkloadSummary(userId){
  const monday = mondayOf(new Date());
  const days = Array.from({ length: 5 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
  const tasks = activeTasks().filter(task => taskAssignedToUser(task, userId) && task.status !== 'done');
  const taskLoads = tasks.map(task => ({ task, load: days.reduce((sum, day) => sum + taskDailyLoad(task, day, userId), 0) })).filter(item => item.load > 0).sort((a, b) => b.load - a.load);
  const assessment = assignmentAssessment(userId, { assigneeId: userId, startDate: dateKey(days[0]), dueDate: dateKey(days[4]), estimatedDays: 0, assessmentOnly: true });
  return {
    assessment, tasks,
    riskCount: tasks.filter(task => taskIsOverdue(task) || task.status === 'blocked').length,
    topTasks: taskLoads.slice(0, 2),
    overflowDays: assessment.overflowDays || 0
  };
}

function renderTeam(main){
  const scopeUsers = activeUsers().filter(user => isPM() || isAdmin() || user.departmentId === currentProfile?.departmentId);
  const scopedTasks = activeTasks().filter(task => scopeUsers.some(user => taskAssignedToUser(task, user.id)));
  const metrics = el('div', 'metric-grid');
  metrics.append(metric('오늘 마감', scopedTasks.filter(task => task.status !== 'done' && task.dueDate === dateKey(new Date())).length, 'warn'), metric('지연·차단', scopedTasks.filter(task => taskIsOverdue(task) || task.status === 'blocked').length, 'danger'), metric('과부하 인원', scopeUsers.filter(user => userWorkloadSummary(user.id).assessment.weeklyLoad > 100).length, 'warn'));
  main.appendChild(metrics);
  const tableWrap = el('section', 'table-wrap panel team-table'); const table = document.createElement('table');
  const head = document.createElement('thead'); const headerRow = document.createElement('tr');
  ['이름 / 직군', '프로젝트', '진행 업무', '이번 주 업무량 / 원인', '다음 가능일', '위험'].forEach(label => headerRow.appendChild(el('th', '', label))); head.appendChild(headerRow); table.appendChild(head);
  const body = document.createElement('tbody');
  scopeUsers.forEach(user => {
    const userTasks = scopedTasks.filter(task => taskAssignedToUser(task, user.id) && task.status !== 'done');
    const summary = userWorkloadSummary(user.id); const assessment = summary.assessment;
    const dangerCount = summary.riskCount;
    const row = document.createElement('tr');
    const name = el('td', '', user.name || user.email); name.append(el('div', 'foot-note', departmentName(user.departmentId))); row.appendChild(name);
    const projectCell = document.createElement('td'); projectCell.appendChild(personProjectBadges(user.id)); row.appendChild(projectCell);
    row.appendChild(el('td', '', `${userTasks.length}건`));
    const loadCell = el('td', assessment.weeklyLoad > 100 ? 'capacity-over' : '', `${assessment.weeklyLoad}% · ${assessment.weeklyLoad > 100 ? '과부하' : assessment.weeklyLoad >= 80 ? '주의' : '여유'}`);
    if(summary.topTasks.length) loadCell.append(el('div', 'foot-note', `집중: ${summary.topTasks.map(item => `${item.task.title} ${item.load.toFixed(1)}일`).join(' · ')}`));
    row.appendChild(loadCell);
    row.appendChild(el('td', '', fmtDate(assessment.nextDate)));
    row.appendChild(el('td', dangerCount || summary.overflowDays ? 'capacity-over' : '', dangerCount || summary.overflowDays ? `지연·차단 ${dangerCount} · 초과 ${summary.overflowDays}일` : '–'));
    row.onclick = () => setView('people'); body.appendChild(row);
  });
  table.appendChild(body); tableWrap.appendChild(table); main.appendChild(tableWrap);
}

function adminAccessPanel(){
  const panel = el('section', 'panel admin-access-panel');
  const title = el('div', 'section-title-row'); title.append(el('h2', '', '사용자 및 권한 관리'));
  const managedUsers = visibleUsers.filter(user => isAdmin() || user.departmentId === currentProfile.departmentId);
  const active = managedUsers.filter(user => user.active);
  const inactive = managedUsers.filter(user => !user.active);
  title.appendChild(el('span', 'foot-note', `${isAdmin() ? `승인 대기 ${accessRequests.length}명 · ` : ''}현재 사용자 ${active.length}명`));
  panel.appendChild(title);
  if(isAdmin() && accessRequests.length) {
    panel.append(el('h3', 'small-heading', '승인 대기'));
    accessRequests.forEach(request => {
      const row = el('div', 'admin-user-row');
      row.append(el('div', '', request.name || request.email || '이름 미지정'));
      row.append(el('span', 'foot-note', request.email || '이메일 없음'));
      row.appendChild(button('승인 및 배정', 'tiny primary', () => openApprovalEditor(request)));
      panel.appendChild(row);
    });
  }
  panel.append(el('h3', 'small-heading', '현재 사용자'));
  active.forEach(user => {
    const row = el('div', 'admin-user-row');
    row.append(el('div', '', user.name || user.email));
    row.append(el('span', 'foot-note', `${user.email || ''} · ${userRoleLabel(user)}${user.departmentId ? ' · ' + departmentName(user.departmentId) : ''}`));
    if(isAdmin()) row.appendChild(button('권한 수정', 'tiny ghost', () => openUserRoleEditor(user)));
    if(canManageOffboarding(user)) row.appendChild(button('퇴사 처리', 'tiny danger-button', () => openOffboardingEditor(user)));
    panel.appendChild(row);
  });
  if(inactive.length) {
    panel.append(el('h3', 'small-heading', '비활성 계정'));
    inactive.forEach(user => panel.append(el('p', 'foot-note', `${user.name || user.email} · 과거 기록 보존`)));
  }
  return panel;
}

function openAdminManager(){
  const { dialog } = openDialog('사용자 및 권한 관리');
  const panel = adminAccessPanel();
  panel.classList.add('admin-manager-panel');
  dialog.appendChild(panel);
}

function renderAdmin(main){
  main.appendChild(adminAccessPanel());
}

function openOffboardingEditor(user){
  const { overlay, dialog } = openDialog(`${user.name || user.email} 퇴사 처리`);
  const openTasks = unfinishedTasksForUser(user.id);
  dialog.append(el('p', 'sub', '완료 업무는 그대로 보존됩니다. 진행 중·예정·차단 업무는 반드시 재배정, 미배정 또는 보관 중 하나로 처리해야 합니다.'));
  const form = el('form', 'form-grid');
  const decisions = [];
  if(!openTasks.length) form.append(el('p', 'sub', '처리할 미완료 업무가 없습니다. 계정 로그인과 새 업무 배정만 중지합니다.'));
  openTasks.forEach(task => {
    const card = el('section', 'handover-task');
    card.append(el('strong', '', task.title));
    const project = projects.find(item => item.id === task.projectId);
    card.append(el('p', 'foot-note', `${project?.code || '공통 업무'}${task.platform ? ` · ${platformName(task.platform)}` : ''} · ${TASK_STATUS[task.status] || '할 일'}`));
    const candidates = activeUsers().filter(candidate => candidate.id !== user.id && (isAdmin() || candidate.departmentId === user.departmentId) && candidate.departmentId === task.departmentId);
    const action = selectField('처리 방법', [
      ['reassign', '다른 담당자에게 재배정'], ['unassign', '미배정으로 남기기'], ['archive', '업무 보관']
    ]);
    const replacement = selectField('새 담당자', [['', '담당자 선택'], ...candidates.map(candidate => [candidate.id, candidate.name || candidate.email])]);
    if(!candidates.length) action.select.value = 'unassign';
    const sync = () => { replacement.wrap.hidden = action.select.value !== 'reassign'; };
    action.select.onchange = sync; sync();
    card.append(action.wrap, replacement.wrap); form.appendChild(card);
    decisions.push({ task, action, replacement });
  });
  const error = el('p', 'form-error'); error.hidden = true;
  const submit = button('업무 처리 후 퇴사 확정', 'danger-button'); submit.type = 'submit';
  const actions = el('div', 'form-actions'); actions.append(submit); form.append(error, actions);
  form.onsubmit = async event => {
    event.preventDefault(); error.hidden = true;
    const input = decisions.map(item => ({ taskId: item.task.id, action: item.action.select.value, userId: item.replacement.select.value }));
    const invalid = input.find(item => item.action === 'reassign' && !item.userId);
    if(invalid) { error.textContent = '재배정 업무의 새 담당자를 선택해주세요.'; error.hidden = false; return; }
    submit.disabled = true; submit.textContent = '퇴사 처리 중…';
    try {
      await offboardUser(user.id, input); overlay.remove(); showToast(`${user.name || user.email}님의 계정을 비활성화하고 업무 인수인계를 반영했습니다.`);
    } catch(cause) {
      error.textContent = cause.message || '퇴사 처리에 실패했습니다.'; error.hidden = false;
    } finally { submit.disabled = false; submit.textContent = '업무 처리 후 퇴사 확정'; }
  };
  dialog.appendChild(form);
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

function openQuickTaskEditor(){
  const { dialog, close } = openDialog('빠른 개인 업무 추가');
  dialog.append(el('p', 'sub', '프로젝트와 연결하지 않는 개인 실무를 바로 등록합니다. 프로젝트·마일스톤·지원 담당자가 필요하면 상세 업무 추가를 사용하세요.'));
  const form = el('form', 'form-grid');
  const title = inputField('업무명', '예: 회의 자료 정리');
  const due = inputField('완료 예정일', '', 'date'); due.input.value = dateKey(new Date());
  const estimate = selectField('예상 작업일', [['0.5', '반나절 (0.5일)'], ['1', '하루 (1일)'], ['2', '이틀 (2일)'], ['3', '사흘 (3일)']]);
  const assessmentBox = el('section', 'assignment-assessment');
  const confirmInput = document.createElement('input'); confirmInput.type = 'checkbox'; confirmInput.id = 'quick-capacity-confirm';
  const confirmLabel = document.createElement('label'); confirmLabel.className = 'force-assignment'; confirmLabel.htmlFor = confirmInput.id;
  confirmLabel.append(confirmInput, document.createTextNode('과부하 경고를 확인했고, 그래도 등록합니다.'));
  let assessment = null;
  const refreshAssessment = () => {
    const candidate = { assigneeId: currentUser?.uid, startDate: due.input.value || null, dueDate: due.input.value || null, estimatedDays: Number(estimate.select.value || 0), status: 'todo' };
    assessment = assignmentAssessment(currentUser?.uid, candidate);
    assessmentBox.className = `assignment-assessment ${assessment.level}`;
    assessmentBox.innerHTML = '';
    assessmentBox.append(el('strong', '', assessment.level === 'danger' ? '오늘 과부하 예상' : assessment.level === 'warn' ? '업무량 주의' : assessment.level === 'ok' ? '등록 가능' : '계산 필요'));
    assessmentBox.append(el('span', '', assessment.level === 'unknown' ? '예정일과 예상 작업일을 입력하면 계산합니다.' : `최대 주간 ${assessment.weeklyLoad}% · 다음 가능일 ${fmtDate(assessment.nextDate)}`));
    assessmentBox.append(el('p', '', assessment.label));
    confirmInput.checked = false; confirmLabel.hidden = assessment.level !== 'danger';
  };
  due.input.onchange = refreshAssessment; estimate.select.onchange = refreshAssessment; refreshAssessment();
  const actions = el('div', 'form-actions'); actions.append(button('취소', 'ghost', close), button('개인 업무 등록', 'primary'));
  form.append(title.wrap, due.wrap, estimate.wrap, assessmentBox, confirmLabel, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      if(!title.input.value.trim()) throw new Error('업무명을 입력해주세요.');
      if(assessment?.level === 'danger' && !confirmInput.checked) throw new Error('과부하 경고를 확인해주세요.');
      await saveTask({
        title: title.input.value, departmentId: currentProfile?.departmentId, assigneeId: currentUser?.uid,
        projectId: null, platform: null, milestoneId: null, dependsOn: [], status: 'todo', progress: 0,
        estimatedDays: Number(estimate.select.value), startDate: due.input.value, dueDate: due.input.value,
        capacityConfirmed: confirmInput.checked
      });
      showToast('개인 업무를 등록했습니다.'); close();
    } catch(error) { alert(error.message); }
  };
  dialog.appendChild(form);
}

function openProjectEditor(project){
  const { overlay, dialog } = openDialog('프로젝트 정보 수정');
  const form = el('form', 'form-grid');
  const name = inputField('프로젝트명', ''); name.input.value = project.name || '';
  const code = inputField('코드', ''); code.input.value = project.code || '';
  const staffingTitle = el('h3', 'small-heading', '플랫폼별 직군 담당자');
  const staffingBox = el('div', 'staffing-grid');
  const staffingValues = new Map((project.staffing || []).map(item => [`${item.platform}:${item.departmentId}`, item.userId || '']));
  (project.platforms || []).forEach(platform => {
    const card = el('section', 'staffing-card'); card.append(el('strong', '', `${platformName(platform)} 담당자`));
    TEMPLATE_DEPARTMENTS.forEach(departmentId => {
      const people = visibleUsers.filter(user => user.active && user.departmentId === departmentId);
      const field = selectField(departmentName(departmentId), [['', '나중에 배정'], ...people.map(user => [user.id, user.name || user.email])]);
      field.select.value = staffingValues.get(`${platform}:${departmentId}`) || '';
      field.select.onchange = () => staffingValues.set(`${platform}:${departmentId}`, field.select.value);
      card.appendChild(field.wrap);
    });
    staffingBox.appendChild(card);
  });
  const submit = button('저장 및 업무에 반영', 'primary');
  form.append(name.wrap, code.wrap, staffingTitle, staffingBox, submit);
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      const staffing = [];
      (project.platforms || []).forEach(platform => TEMPLATE_DEPARTMENTS.forEach(departmentId => staffing.push({ platform, departmentId, userId: staffingValues.get(`${platform}:${departmentId}`) || null })));
      await saveProject({ ...project, name: name.input.value, code: code.input.value, staffing });
      await syncProjectStaffing(project.id, staffing);
      overlay.remove(); showToast('프로젝트 정보와 자동 업무 담당자를 반영했습니다.');
    } catch(error) { alert(error.message); }
  };
  dialog.appendChild(form);
}

function openProjectCreator(){
  const { dialog, close } = openDialog('자동 일정 프로젝트 만들기');
  dialog.classList.add('project-create-dialog');
  const form = el('form', 'form-grid project-create-form');
  const name = inputField('프로젝트명', '예: 프로젝트 12');
  const code = inputField('프로젝트 코드', '예: PC12');
  const guide = el('p', 'sub', '고정 마일스톤과 플랫폼별 담당자를 설정하면 직군별 업무와 일정이 자동으로 생성됩니다. 담당자는 나중에 배정할 수 있습니다.');
  const platformField = el('fieldset', 'platform-picker');
  platformField.appendChild(el('legend', '', '적용 플랫폼'));
  const platformChecks = PLATFORMS.map(platform => {
    const label = el('label', 'check-option'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = platform.id; input.checked = platform.id === 'pc';
    label.append(input, el('span', '', platform.name)); platformField.appendChild(label); return input;
  });
  const milestonesTitle = el('h3', 'small-heading', '고정 마일스톤');
  const milestoneDates = {};
  const milestoneFields = DELIVERY_MILESTONES.map(definition => {
    const field = inputField(definition.title, '', 'date'); milestoneDates[definition.key] = field; return field;
  });
  const staffingTitle = el('h3', 'small-heading', '플랫폼별 직군 담당자');
  const staffingBox = el('div', 'staffing-grid');
  const staffingValues = new Map();
  const currentPlatforms = () => platformChecks.filter(input => input.checked).map(input => input.value);
  const eligiblePeople = departmentId => visibleUsers.filter(user => user.active && user.departmentId === departmentId);
  const renderStaffing = () => {
    staffingBox.innerHTML = '';
    currentPlatforms().forEach(platform => {
      const card = el('section', 'staffing-card'); card.append(el('strong', '', `${platformName(platform)} 담당자`));
      TEMPLATE_DEPARTMENTS.forEach(departmentId => {
        const key = `${platform}:${departmentId}`;
        const options = [['', '나중에 배정']].concat(eligiblePeople(departmentId).map(user => [user.id, user.name || user.email]));
        const field = selectField(departmentName(departmentId), options); field.select.value = staffingValues.get(key) || '';
        field.select.onchange = () => staffingValues.set(key, field.select.value);
        card.appendChild(field.wrap);
      });
      staffingBox.appendChild(card);
    });
  };
  platformChecks.forEach(input => { input.onchange = renderStaffing; });
  renderStaffing();
  const actions = el('div', 'form-actions project-create-actions');
  const submit = button('일정 자동 생성', 'primary');
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
  form.append(guide, name.wrap, code.wrap, platformField, milestonesTitle, ...milestoneFields.map(field => field.wrap), staffingTitle, staffingBox, error, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    const missingName = !name.input.value.trim();
    const missingCode = !code.input.value.trim();
    const selectedPlatforms = currentPlatforms();
    const missingMilestone = milestoneFields.find(field => !field.input.value);
    showFieldError(name, missingName ? '프로젝트명을 입력해주세요.' : '');
    showFieldError(code, missingCode ? '프로젝트 코드를 입력해주세요.' : '');
    if(missingName || missingCode || !selectedPlatforms.length || missingMilestone) {
      error.textContent = missingMilestone ? `${missingMilestone.wrap.querySelector('span')?.textContent || '고정 마일스톤'}을 입력해주세요.` : '프로젝트명, 코드와 적용 플랫폼을 확인해주세요.';
      error.hidden = false;
      (missingName ? name : missingCode ? code : missingMilestone).input.focus();
      return;
    }
    submit.disabled = true; submit.textContent = '생성 중…';
    try {
      const staffing = [];
      selectedPlatforms.forEach(platform => TEMPLATE_DEPARTMENTS.forEach(departmentId => {
        const userId = staffingValues.get(`${platform}:${departmentId}`) || null;
        staffing.push({ platform, departmentId, userId });
      }));
      await createScheduledProject({
        name: name.input.value, code: code.input.value, platforms: selectedPlatforms, staffing,
        milestoneDates: Object.fromEntries(DELIVERY_MILESTONES.map(definition => [definition.key, milestoneDates[definition.key].input.value]))
      });
      close();
    } catch(cause) {
      error.textContent = `일정을 생성하지 못했습니다. ${cause.message || '잠시 후 다시 시도해주세요.'}`;
      error.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = '일정 자동 생성';
    }
  };
  dialog.appendChild(form);
}

function importHeaderKey(value){ return String(value || '').replace(/\s|\n|\r|\(|\)|\[|\]|_|\-/g, '').toLowerCase(); }
function importColumn(headers, aliases){
  const normalized = headers.map(importHeaderKey);
  for(const alias of aliases) { const index = normalized.indexOf(importHeaderKey(alias)); if(index >= 0) return index; }
  return -1;
}
function importDate(value){
  if(!value) return '';
  if(value instanceof Date && !Number.isNaN(value.getTime())) return dateKey(value);
  if(typeof value === 'number' && window.XLSX?.SSF) {
    const parsed = XLSX.SSF.parse_date_code(value); if(parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value).trim().replace(/\./g, '-').replace(/\//g, '-');
  const match = text.match(/(\d{2,4})-(\d{1,2})-(\d{1,2})/);
  if(!match) return '';
  const year = match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1]);
  return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}
function importSheetHeader(sheet){
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = matrix.findIndex(row => row.filter(Boolean).length >= 3 && row.some(cell => /프로젝트|업무|내용|작업|시작일|마감일|작업자|담당자/.test(String(cell))));
  if(headerIndex < 0) throw new Error('업무 헤더 행을 찾지 못했습니다. 프로젝트·업무·시작일 등의 열이 있는 시트를 선택해주세요.');
  return { matrix, headerIndex, headers: matrix[headerIndex] };
}
function inferredImportPlatform(value, sheetName = ''){
  const text = `${value || ''} ${sheetName || ''}`.toLowerCase();
  if(text.includes('모바일') || text.includes('mobile') || /pc\d+\s*m\b/i.test(text)) return 'mobile';
  if(text.includes('콘솔') || text.includes('console') || /pc\d+\s*c\b/i.test(text)) return 'console';
  return 'pc';
}
function inferredImportDepartment(value, sourceName = ''){
  const text = `${value || ''} ${sourceName || ''}`.toLowerCase();
  if(text.includes('ui')) return 'ui';
  return importedDepartment(value);
}
function importedProjectIdentity(value, sheetName){
  const raw = String(value || '').trim();
  const rawCode = raw.match(/PC\s*\d+(?:\s*[MC])?/i)?.[0]?.replace(/\s/g, '').toUpperCase();
  const sheetCode = String(sheetName || '').match(/PC\s*\d+(?:\s*[MC])?/i)?.[0]?.replace(/\s/g, '').toUpperCase();
  const generic = /^(PC|모바일|콘솔|데모|완전판|타프로젝트|준비|리드)$/i.test(raw);
  const projectCode = rawCode || (generic ? sheetCode : '') || raw;
  return { projectCode, projectName: rawCode || generic ? projectCode : (raw || projectCode) };
}
function previewImportedSheet(sheet, sourceName, sheetName, overrides = {}, defaultAssignee = ''){
  const { matrix, headerIndex, headers } = importSheetHeader(sheet);
  const detectedColumns = {
    project: importColumn(headers, ['프로젝트 코드', '프로젝트', '프로젝트명']), title: importColumn(headers, ['업무명', '업무', '내용', '작업 내용', '세부 업무']),
    start: importColumn(headers, ['시작일', '시작']), due: importColumn(headers, ['마감일', '종료일', '종료']), estimate: importColumn(headers, ['워킹데이', '작업일', '예상 작업일', 'workday']),
    assignee: importColumn(headers, ['담당자', '작업자', '담당']), platform: importColumn(headers, ['플랫폼']), department: importColumn(headers, ['직군', '부서', '분류']),
    status: importColumn(headers, ['상태', '진행 상태', '진행', '완료']), system: importColumn(headers, ['시스템', '화면', '영역']), buildVersion: importColumn(headers, ['빌드 버전', '버전']), taskGroup: importColumn(headers, ['업무 묶음', '세부내용', '분류', '단계'])
  };
  const columns = { ...detectedColumns, ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => Number.isInteger(value) && value >= 0)) };
  const carried = {};
  const rows = matrix.slice(headerIndex + 1).map((cells, index) => {
    const rawValue = key => columns[key] >= 0 ? cells[columns[key]] : '';
    const value = key => {
      const raw = rawValue(key); const text = String(raw || '').trim();
      if(['project', 'assignee', 'platform', 'department', 'taskGroup', 'system', 'buildVersion'].includes(key)) {
        if(text && text !== '-') carried[key] = raw;
        return text && text !== '-' ? raw : (carried[key] || '');
      }
      return raw;
    };
    const project = String(value('project') || '').trim(); const title = String(value('title') || '').trim();
    const rawStart = importDate(value('start')); const rawDue = importDate(value('due'));
    const startDate = rawStart && rawStart >= '2000-01-01' ? rawStart : '';
    const dueDate = rawDue && rawDue >= '2000-01-01' ? rawDue : '';
    const estimateRaw = String(value('estimate') || '').replace(/[^0-9.]/g, '');
    const estimatedDays = Number(estimateRaw || 0);
    const errors = [];
    if(!project) errors.push('프로젝트 없음');
    if(!title) errors.push('업무명 없음');
    if(startDate && dueDate && dueDate < startDate) errors.push('마감일이 시작일보다 빠름');
    const identity = importedProjectIdentity(project, sheetName);
    return {
      sourceRow: headerIndex + index + 2, ...identity,
      title, startDate, dueDate, estimatedDays: estimatedDays || 1, assignee: String(value('assignee') || '').trim() || defaultAssignee,
      platform: inferredImportPlatform(value('platform') || project, sheetName), departmentId: inferredImportDepartment(value('department'), sourceName), status: importedTaskStatus(value('status')),
      system: String(value('system') || '').trim(), buildVersion: String(value('buildVersion') || '').trim(), taskGroup: String(value('taskGroup') || '').trim(), valid: !errors.length, errors
    };
  }).filter(row => row.projectCode || row.title);
  importPreview = { sourceName, sheetName, headers, columns, rows };
  return importPreview;
}

function openImportEditor(){
  const { dialog, close } = openDialog('엑셀 업무 이관');
  dialog.classList.add('import-dialog');
  dialog.append(el('p', 'sub', '파일을 분석한 뒤 오류 행을 먼저 확인합니다. 실제 저장은 미리보기를 확인한 뒤에만 실행됩니다.'));
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
  const fileField = el('label', 'file-field'); fileField.append(el('span', '', '엑셀 또는 CSV 파일'), input);
  const sheetPicker = selectField('시트 선택', []); sheetPicker.wrap.hidden = true;
  const ownerPicker = selectField('시트 담당자', [['', '행의 담당자 열만 사용']]); ownerPicker.wrap.hidden = true;
  const mappingBox = el('section', 'import-mapping'); mappingBox.hidden = true;
  const previewBox = el('div', 'import-preview');
  const analyze = button('파일 분석', 'primary'); analyze.type = 'button'; analyze.disabled = true;
  const importButton = button('이관 실행', 'primary'); importButton.type = 'button'; importButton.hidden = true;
  const error = el('p', 'form-error'); error.hidden = true;
  let workbook = null;
  let mappingOverrides = {};
  const ownerOptions = () => {
    const sheetName = sheetPicker.select.value || '';
    const users = [...new Map([...(currentProfile?.active ? [[currentProfile.name || currentUser?.email || '', currentProfile.name || currentUser?.email]] : []), ...activeUsers().map(user => [user.name || user.email, user.name || user.email])]).values()].filter(Boolean);
    const options = [...new Set([sheetName, ...users])];
    ownerPicker.select.innerHTML = ''; ownerPicker.select.add(new Option('행의 담당자 열만 사용', ''));
    options.forEach(name => ownerPicker.select.add(new Option(`${name} (빈 담당자 행에 적용)`, name)));
    const match = users.find(name => name === sheetName || sheetName.includes(name) || name.includes(sheetName));
    ownerPicker.select.value = match || '';
  };
  const renderMapping = () => {
    mappingBox.innerHTML = ''; mappingOverrides = {};
    const { headers } = importSheetHeader(workbook.Sheets[sheetPicker.select.value]);
    const fields = [
      ['project', '프로젝트', ['프로젝트 코드', '프로젝트', '프로젝트명']], ['title', '업무명', ['업무명', '업무', '내용', '작업 내용', '세부 업무']],
      ['start', '시작일', ['시작일', '시작']], ['due', '마감일', ['마감일', '종료일', '종료']], ['estimate', '예상 워킹데이', ['워킹데이', '작업일', '예상 작업일']],
      ['assignee', '담당자', ['담당자', '작업자', '담당']], ['platform', '플랫폼', ['플랫폼']], ['department', '직군', ['직군', '부서', '분류']], ['status', '상태', ['상태', '진행 상태', '진행', '완료']],
      ['system', '시스템/화면', ['시스템', '화면', '영역']], ['buildVersion', '빌드 버전', ['빌드 버전', '버전']], ['taskGroup', '업무 묶음', ['업무 묶음', '세부내용', '분류', '단계']]
    ];
    mappingBox.append(el('strong', '', '열 매핑'), el('p', 'foot-note', '자동 인식 결과가 맞지 않으면 원본 열을 직접 바꾸세요. 프로젝트와 업무명은 필수입니다.'));
    const grid = el('div', 'mapping-grid');
    fields.forEach(([key, label, aliases]) => {
      const detected = importColumn(headers, aliases); const field = selectField(label, [['-1', '연결하지 않음'], ...headers.map((header, index) => [String(index), `${String(header || '(빈 열)')} (${index + 1}열)`])]);
      field.select.value = String(detected); field.select.onchange = () => { const value = Number(field.select.value); if(value >= 0) mappingOverrides[key] = value; else delete mappingOverrides[key]; previewBox.innerHTML = ''; importButton.hidden = true; };
      if(detected >= 0) mappingOverrides[key] = detected;
      grid.appendChild(field.wrap);
    });
    mappingBox.appendChild(grid); mappingBox.hidden = false;
  };
  const renderPreview = () => {
    error.hidden = true; previewBox.innerHTML = '';
    const preview = previewImportedSheet(workbook.Sheets[sheetPicker.select.value], input.files[0].name, sheetPicker.select.value, mappingOverrides, ownerPicker.select.value);
    const seenKeys = new Set();
    preview.rows.forEach(row => {
      const key = importTaskKey(row);
      row.duplicate = row.valid && (isDuplicateImportedRow(row) || seenKeys.has(key));
      if(row.valid) seenKeys.add(key);
    });
    const valid = preview.rows.filter(row => row.valid && !row.duplicate); const invalid = preview.rows.filter(row => !row.valid); const duplicates = preview.rows.filter(row => row.duplicate);
    previewBox.append(el('strong', '', `검증 결과 · 이관 가능 ${valid.length}행 / 확인 필요 ${invalid.length}행 / 중복 제외 ${duplicates.length}행`));
    previewBox.append(el('p', 'foot-note', `자동 인식 열: 프로젝트 ${preview.columns.project >= 0 ? '✓' : '–'} · 업무 ${preview.columns.title >= 0 ? '✓' : '–'} · 시작일 ${preview.columns.start >= 0 ? '✓' : '–'} · 마감일 ${preview.columns.due >= 0 ? '✓' : '–'}`));
    const table = document.createElement('table'); const head = document.createElement('thead'); const hr = document.createElement('tr'); ['원본 행', '프로젝트', '업무', '기간', '담당자', '결과'].forEach(label => hr.appendChild(el('th', '', label))); head.appendChild(hr); table.appendChild(head);
    const body = document.createElement('tbody'); preview.rows.slice(0, 20).forEach(row => { const tr = document.createElement('tr'); const result = row.duplicate ? '기존 업무와 중복 · 제외' : row.valid ? '이관 가능' : row.errors.join(', '); tr.append(el('td', '', String(row.sourceRow)), el('td', '', row.projectCode), el('td', '', row.title), el('td', '', `${fmtDate(row.startDate)} ~ ${fmtDate(row.dueDate)}`), el('td', '', row.assignee || '미배정'), el('td', row.valid && !row.duplicate ? '' : 'capacity-over', result)); body.appendChild(tr); }); table.appendChild(body); const wrap = el('div', 'table-wrap'); wrap.appendChild(table); previewBox.appendChild(wrap);
    if(preview.rows.length > 20) previewBox.append(el('p', 'foot-note', `처음 20행만 표시했습니다. 총 ${preview.rows.length}행을 검증했습니다.`));
    importButton.hidden = valid.length === 0;
  };
  input.onchange = async () => {
    analyze.disabled = true; sheetPicker.wrap.hidden = true; ownerPicker.wrap.hidden = true; mappingBox.hidden = true; previewBox.innerHTML = ''; importButton.hidden = true;
    try {
      if(!input.files?.[0]) return;
      const data = await input.files[0].arrayBuffer(); workbook = XLSX.read(data, { type: 'array', cellDates: true });
      sheetPicker.select.innerHTML = ''; workbook.SheetNames.forEach(name => sheetPicker.select.add(new Option(name, name)));
      sheetPicker.wrap.hidden = false; ownerPicker.wrap.hidden = false; ownerOptions(); renderMapping(); analyze.disabled = false;
    } catch(cause) { error.textContent = `파일을 읽지 못했습니다. ${cause.message || ''}`; error.hidden = false; }
  };
  analyze.onclick = () => { try { renderPreview(); } catch(cause) { error.textContent = cause.message; error.hidden = false; } };
  sheetPicker.select.onchange = () => { previewBox.innerHTML = ''; importButton.hidden = true; try { ownerOptions(); renderMapping(); } catch(cause) { error.textContent = cause.message; error.hidden = false; } };
  ownerPicker.select.onchange = () => { previewBox.innerHTML = ''; importButton.hidden = true; };
  importButton.onclick = async () => {
    if(!importPreview) return;
    importButton.disabled = true; importButton.textContent = '이관 중…';
    try { const result = await importTasksFromPreview(importPreview.rows, importPreview.sourceName); showToast(`${result.imported}개 업무를 이관했습니다. 중복 제외 ${result.duplicatesSkipped}행`); close(); }
    catch(cause) { error.textContent = `이관하지 못했습니다. ${cause.message || ''}`; error.hidden = false; }
    finally { importButton.disabled = false; importButton.textContent = '이관 실행'; }
  };
  dialog.append(fileField, sheetPicker.wrap, ownerPicker.wrap, mappingBox, analyze, error, previewBox, importButton);
}

function openAssignmentEditor(task){
  const isOwnHandover = task.assigneeId === currentUser?.uid && !isAdmin() && !isPM() && !isLead();
  const { dialog, close } = openDialog(isOwnHandover ? '업무 이관' : '담당자 변경');
  dialog.append(el('p', 'sub', `${projectCode(task)} · ${task.title} · ${task.estimatedDays || 0} 워킹데이 · 마감 ${fmtDate(task.dueDate)}`));
  const form = el('form', 'form-grid');
  const candidates = [...new Map([
    ...(currentProfile?.active ? [[currentUser.uid, { id: currentUser.uid, ...currentProfile }]] : []),
    ...activeUsers().map(user => [user.id, user])
  ]).values()].filter(user => user.departmentId === task.departmentId);
  const assignee = selectField('새 주 담당자', candidates.length ? candidates.map(user => [user.id, user.name || user.email]) : [['', '해당 부서에 배정 가능한 인원이 없습니다']]);
  assignee.select.value = candidates.some(user => user.id === task.assigneeId) ? task.assigneeId : '';
  const result = el('div', 'assignment-assessment');
  const update = () => {
    const assessment = assignmentAssessment(assignee.select.value, task);
    result.className = `assignment-assessment ${assessment.level}`;
    result.innerHTML = '';
    result.append(el('strong', '', assessment.level === 'danger' ? '과부하 예상' : assessment.level === 'warn' ? '배정 주의' : assessment.level === 'ok' ? '배정 가능' : '계산 필요'));
    result.append(el('span', '', `최대 주간 ${assessment.weeklyLoad}% · 다음 가능일 ${fmtDate(assessment.nextDate)}`));
    result.append(el('p', '', assessment.label));
  };
  assignee.select.onchange = update; update();
  const force = document.createElement('input'); force.type = 'checkbox'; force.id = `force-assignment-${task.id}`;
  const forceLabel = document.createElement('label'); forceLabel.className = 'force-assignment'; forceLabel.htmlFor = force.id; forceLabel.append(force, document.createTextNode('과부하 경고를 확인했고, 그래도 배정합니다.'));
  const refresh = () => {
    update();
    const assessment = assignmentAssessment(assignee.select.value, task);
    force.checked = false;
    forceLabel.hidden = assessment.level !== 'danger';
  };
  assignee.select.onchange = refresh; refresh();
  const actions = el('div', 'form-actions'); actions.append(button('취소', 'ghost', close), button(isOwnHandover ? '이관하기' : '배정 저장', 'primary'));
  form.append(assignee.wrap, result, forceLabel, actions);
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      if(!assignee.select.value) throw new Error('해당 부서의 담당자를 선택해주세요.');
      const assessment = await reassignTask(task.id, assignee.select.value, force.checked);
      showToast(`${personName(assignee.select.value)}님에게 업무를 ${isOwnHandover ? '이관했습니다' : '배정했습니다'}.${assessment.level === 'danger' ? ' 과부하 경고가 기록되었습니다.' : ''}`);
      close();
    } catch(error) { showToast(error.message, 'error'); }
  };
  dialog.appendChild(form);
}

function openTaskEditor(task, initial = {}){
  const editing = !!task;
  const { dialog, close, onClose } = openDialog(editing ? '업무 수정' : '업무 추가');
  const form = el('form', 'form-grid');
  const title = inputField('업무명', '업무 내용을 입력하세요'); title.input.value = task?.title || '';
  const departmentOptions = DEPARTMENTS.filter(dept => isAdmin() || isPM() || dept.id === currentProfile.departmentId).map(dept => [dept.id, dept.name]);
  const department = selectField('담당 부서', departmentOptions); department.select.value = task?.departmentId || currentProfile.departmentId || departmentOptions[0]?.[0] || '';
  const people = [...new Map([
    ...(currentProfile?.active ? [[currentUser.uid, { id: currentUser.uid, ...currentProfile }]] : []),
    ...visibleUsers.filter(user => user.active && (!isLead() || user.departmentId === currentProfile.departmentId)).map(user => [user.id, user])
  ]).values()];
  const assignee = selectField('담당자', []);
  const peopleInDepartment = () => people.filter(user => user.departmentId === department.select.value);
  const refreshAssigneeOptions = () => {
    const selectedId = assignee.select.value || task?.assigneeId || '';
    assignee.select.innerHTML = '';
    assignee.select.add(new Option('담당자를 선택하세요', ''));
    peopleInDepartment().forEach(user => assignee.select.add(new Option(user.name || user.email, user.id)));
    if(task?.assigneeId && !peopleInDepartment().some(user => user.id === task.assigneeId)) assignee.select.add(new Option(userName(task.assigneeId), task.assigneeId));
    assignee.select.value = [...assignee.select.options].some(option => option.value === selectedId) ? selectedId : '';
  };
  refreshAssigneeOptions();
  if(editing) assignee.select.disabled = true;
  // 공동 지원 배정은 여러 부서의 업무량과 접근 권한에 영향을 주므로 PM/관리자만 처리합니다.
  const canManageSupport = isAdmin() || isPM();
  const supportAssignees = multiSelectField('지원 담당자 (선택)');
  const initialSupportIds = (task?.assignees || []).filter(item => item.userId !== task?.assigneeId).map(item => item.userId);
  const initialAssigneeIds = task?.assigneeIds || task?.assignees?.map(item => item.userId) || (task?.assigneeId ? [task.assigneeId] : []);
  const refreshSupportOptions = () => {
    const selected = new Set([...supportAssignees.select.selectedOptions].map(option => option.value));
    initialSupportIds.forEach(id => selected.add(id));
    supportAssignees.select.innerHTML = '';
    peopleInDepartment().filter(user => user.id !== assignee.select.value).forEach(user => {
      const option = new Option(user.name || user.email, user.id); option.selected = selected.has(user.id); supportAssignees.select.add(option);
    });
  };
  refreshSupportOptions();
  supportAssignees.select.disabled = !canManageSupport;
  const project = selectField('프로젝트', projects.filter(item => item.status !== 'completed' || item.id === task?.projectId).map(item => [item.id, item.code ? `${item.code} · ${item.name || ''}`.trim() : item.name])); project.select.value = task?.projectId || initial.projectId || '';
  const platform = selectField('플랫폼', [['', '공통'], ...PLATFORMS.map(item => [item.id, item.name])]); platform.select.value = task?.platform || initial.platform || '';
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
  project.select.onchange = () => { refreshProjectRelations(); refreshDependencyWarning?.(); };
  department.select.onchange = () => { refreshAssigneeOptions(); refreshSupportOptions(); refreshProjectRelations(); refreshDependencyWarning?.(); refreshAssignmentWarning?.(); };
  refreshProjectRelations();
  const status = selectField('상태', Object.entries(TASK_STATUS)); status.select.value = task?.status || 'todo';
  const progress = inputField('진척률 (0~100)', '', 'number'); progress.input.min = '0'; progress.input.max = '100'; progress.input.value = task?.progress ?? 0;
  const estimate = inputField('예상 작업일', '예: 2.5', 'number'); estimate.input.min = '0'; estimate.input.step = '0.5'; estimate.input.value = task?.estimatedDays ?? '';
  const start = inputField('시작일', '', 'date'); start.input.value = dateOnly(task?.startDate || initial.startDate);
  const due = inputField('마감일', '', 'date'); due.input.value = dateOnly(task?.dueDate || initial.dueDate || initial.startDate);
  const assignmentWarning = el('section', 'assignment-assessment');
  const capacityConfirm = document.createElement('input'); capacityConfirm.type = 'checkbox'; capacityConfirm.id = `capacity-confirm-${task?.id || 'new'}`;
  const capacityConfirmLabel = document.createElement('label'); capacityConfirmLabel.className = 'force-assignment'; capacityConfirmLabel.htmlFor = capacityConfirm.id;
  capacityConfirmLabel.append(capacityConfirm, document.createTextNode('과부하 경고를 확인했고, 그래도 배정합니다.'));
  capacityConfirmLabel.hidden = true;
  let latestAssignmentAssessments = [];
  const selectedAssignees = () => {
    const ids = [...new Set([assignee.select.value, ...[...supportAssignees.select.selectedOptions].map(option => option.value)].filter(Boolean))];
    return ids.map((userId, index) => ({ userId, share: 1 / ids.length, role: index === 0 ? 'primary' : 'co' }));
  };
  const assignmentHasChanged = () => selectedAssignees().map(item => item.userId).join('|') !== initialAssigneeIds.join('|');
  const refreshAssignmentWarning = () => {
    const assignees = selectedAssignees();
    const candidate = { assigneeId: assignee.select.value, assignees, startDate: start.input.value || null, dueDate: due.input.value || null, estimatedDays: Number(estimate.input.value || 0), status: status?.select?.value || 'todo' };
    latestAssignmentAssessments = assignees.map(item => ({ userId: item.userId, assessment: assignmentAssessment(item.userId, candidate, true) }));
    const worst = latestAssignmentAssessments.find(item => item.assessment.level === 'danger') || latestAssignmentAssessments.find(item => item.assessment.level === 'warn') || latestAssignmentAssessments[0] || { assessment: { level: 'unknown', label: '담당자를 선택해주세요.', weeklyLoad: 0, nextDate: null } };
    const assessment = worst.assessment;
    assignmentWarning.className = `assignment-assessment ${assessment.level}`;
    assignmentWarning.innerHTML = '';
    assignmentWarning.append(el('strong', '', assessment.level === 'danger' ? '과부하 예상' : assessment.level === 'warn' ? '배정 주의' : assessment.level === 'ok' ? '배정 가능' : '계산 필요'));
    assignmentWarning.append(el('span', '', assessment.level === 'unknown' ? '담당자·기간·예상 작업일 입력 후 자동 계산' : `최대 주간 ${assessment.weeklyLoad}% · 다음 가능일 ${fmtDate(assessment.nextDate)}`));
    assignmentWarning.append(el('p', '', `${assignees.length > 1 ? `${assignees.length}명 균등 분배 · ` : ''}${assessment.label}`));
    capacityConfirm.checked = false;
    capacityConfirmLabel.hidden = assessment.level !== 'danger';
  };
  const dependencyWarning = el('section', 'dependency-warning'); dependencyWarning.hidden = true;
  const dependencyConfirm = document.createElement('input'); dependencyConfirm.type = 'checkbox'; dependencyConfirm.id = `dependency-confirm-${task?.id || 'new'}`;
  const refreshDependencyWarning = () => {
    const selected = [...dependsOn.select.selectedOptions].map(option => tasks.find(item => item.id === option.value)).filter(Boolean);
    const conflicted = selected.filter(item => item.dueDate && start.input.value && item.dueDate >= start.input.value && item.status !== 'done');
    dependencyWarning.innerHTML = ''; dependencyConfirm.checked = false;
    if(!conflicted.length) { dependencyWarning.hidden = true; return; }
    dependencyWarning.hidden = false;
    dependencyWarning.append(el('strong', '', '선행 업무와 일정이 겹칩니다.'));
    dependencyWarning.append(el('p', '', conflicted.map(item => `${item.title} (${fmtDate(item.dueDate)}까지)`).join(' · ')));
    const label = el('label', 'dependency-confirm'); label.htmlFor = dependencyConfirm.id; label.append(dependencyConfirm, document.createTextNode('일정 겹침을 확인했고, 수동 일정으로 저장합니다.'));
    dependencyWarning.append(label);
  };
  dependsOn.select.onchange = refreshDependencyWarning;
  start.input.onchange = refreshDependencyWarning;
  assignee.select.onchange = () => { refreshSupportOptions(); refreshAssignmentWarning(); };
  supportAssignees.select.onchange = refreshAssignmentWarning;
  estimate.input.oninput = refreshAssignmentWarning;
  start.input.onchange = () => { refreshDependencyWarning(); refreshAssignmentWarning(); };
  due.input.onchange = refreshAssignmentWarning;
  if(task?.generated) form.append(el('p', 'sub', '자동 생성 업무입니다. 일정 날짜를 직접 바꾸면 이후 자동 재계산 대상에서 제외됩니다.'));
  const basic = el('section', 'task-editor-section');
  basic.append(title.wrap, department.wrap, assignee.wrap, project.wrap, platform.wrap, estimate.wrap, start.wrap, due.wrap);
  const advanced = el('details', 'task-editor-advanced');
  advanced.open = editing || initial.showAdvanced === true;
  advanced.appendChild(el('summary', '', '추가 설정'));
  const advancedGrid = el('div', 'task-editor-advanced-grid');
  advancedGrid.append(supportAssignees.wrap, milestone.wrap, dependsOn.wrap, status.wrap, progress.wrap);
  advanced.appendChild(advancedGrid);
  form.append(basic, advanced);
  form.append(dependencyWarning, assignmentWarning, capacityConfirmLabel);
  refreshDependencyWarning();
  refreshAssignmentWarning();
  if(editing && canManageTaskAssignment(task)) {
    const assignRow = el('div', 'assignment-editor-row');
    assignRow.append(el('span', 'foot-note', `현재 담당자 · ${taskAssigneeName(task)}`), button('담당자 변경', 'tiny ghost', () => openAssignmentEditor(task)));
    form.appendChild(assignRow);
  }
  const actions = el('div', 'form-actions'); actions.appendChild(button('저장', 'primary'));
  if(editing) actions.appendChild(button('업무 보관', 'danger-button', async () => { if(confirm('이 업무를 보관할까요?')) { await archiveTask(task.id); close(); } }));
  form.appendChild(actions);
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      if(!title.input.value.trim() || !project.select.value || !assignee.select.value || !start.input.value || !estimate.input.value) throw new Error('업무명, 프로젝트, 담당자, 시작일, 예상 작업일을 입력해주세요.');
      if(!dependencyWarning.hidden && !dependencyConfirm.checked) throw new Error('선행 업무와 겹치는 일정을 확인해주세요.');
      if(assignmentHasChanged() && latestAssignmentAssessments.some(item => item.assessment.level === 'danger') && !capacityConfirm.checked) throw new Error('담당자 과부하 경고를 확인해주세요.');
      await saveTask({ id: task?.id, title: title.input.value, departmentId: department.select.value, assigneeId: assignee.select.value, assignees: selectedAssignees(), projectId: project.select.value || null, platform: platform.select.value || null, milestoneId: milestone.select.value || null, dependsOn: [...dependsOn.select.selectedOptions].map(option => option.value), status: status.select.value, progress: Number(progress.input.value), estimatedDays: Number(estimate.input.value), startDate: start.input.value || null, dueDate: due.input.value || null, capacityConfirmed: capacityConfirm.checked, dateOverride: Boolean(task?.generated && (dateOnly(task.startDate) !== start.input.value || dateOnly(task.dueDate) !== due.input.value)) });
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
  const impact = el('section', 'milestone-impact'); impact.hidden = true;
  const renderImpact = () => {
    const nextDate = due.input.value;
    const currentDate = dateOnly(milestone?.dueDate);
    const anchorKey = milestone?.anchorKey;
    if(!editing || !anchorKey || !nextDate || nextDate === currentDate) { impact.hidden = true; impact.innerHTML = ''; return; }
    const linked = tasksForProject(projectId).filter(task => task.generated && task.scheduleRule?.anchorKey === anchorKey && !task.dateOverride);
    const manual = tasksForProject(projectId).filter(task => task.scheduleRule?.anchorKey === anchorKey && task.dateOverride);
    impact.hidden = false; impact.innerHTML = '';
    impact.append(el('strong', '', `연결된 업무 ${linked.length}건의 일정이 다시 계산됩니다.`));
    impact.append(el('p', '', manual.length ? `수동으로 날짜를 고정한 업무 ${manual.length}건은 변경하지 않습니다.` : '수동으로 날짜를 고정한 업무는 없습니다.'));
    const list = el('div', 'milestone-impact-list');
    linked.slice(0, 5).forEach(task => {
      const next = scheduledDates(nextDate, task.scheduleRule.dueOffset, task.scheduleRule.estimatedDays || task.estimatedDays);
      list.append(el('p', '', `${task.title}  ·  ${dateOnly(task.startDate)}~${dateOnly(task.dueDate)} → ${next.startDate}~${next.dueDate}`));
    });
    if(linked.length > 5) list.append(el('p', '', `외 ${linked.length - 5}건`));
    impact.append(list);
  };
  due.input.onchange = renderImpact;
  form.appendChild(impact);
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
  try {
    main.innerHTML = '';
    renderAccountActions();
    renderPrimaryNavigation();
    if(!currentUser) { loginScreen(main); return; }
    if(!currentProfile || !isApproved()) { pendingScreen(main); return; }
    if(activeView === 'home') { renderHome(main); return; }
    if(activeView === 'my-work' || activeView === 'work') { renderWork(main); return; }
    if(activeView === 'team') { renderPeople(main); return; }
    if(activeView === 'people') { renderPeople(main); return; }
    if(activeView === 'admin' && isAdmin()) { renderAdmin(main); return; }
    renderProjects(main);
  } catch(error) {
    console.error('화면 렌더링 실패:', error);
    main.innerHTML = '';
    const panel = el('section', 'panel render-error');
    panel.append(el('p', 'eyebrow', 'SCREEN ERROR'), el('h2', '', '화면을 표시하지 못했습니다.'), el('p', 'sub', '오류 정보를 확인해 수정 중입니다.'), el('code', 'render-error-code', error?.message || String(error)));
    main.appendChild(panel);
  }
}

// state.js의 인증·Firestore 콜백에서도 항상 같은 렌더러를 호출할 수 있게 노출합니다.
window.renderScheduleApp = rerender;
