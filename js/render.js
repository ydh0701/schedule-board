Warning: truncated output (original token count: 34018)
Total output lines: 1811

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

function renderProjectTaskList(main, project){
  const section = el('section', 'panel project-task-panel');
  const head = el('div', 'project-task-board-head'); head.append(el('h2', '', '업무 현황'), canManageProjects() ? button('+ 업무 추가', 'tiny primary', () => openTaskEditor(null, { projectId: project.id })) : el('span', '', ''));
  section.appendChild(head);
  const filters = el('div', 'project-task-board-filters');
  const filterState = { value: 'active' };
  const list = el('div', 'project-task-board');
  const draw = () => {
    list.innerHTML = '';
    const items = tasksForProject(project.id).filter(task => filterState.value === 'all' || (filterState.value === 'risk' ? (taskIsOverdue(task) || task.status === 'blocked' || !task.assigneeId) : task.status !== 'done'));
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
  section.append(filters, list); draw(); main.appendChild(section);
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
  popover.style.top = `${rect.bottom + 8 + popover.offsetHeight > window.in…14018 tokens truncated… if(typeof value === 'number' && window.XLSX?.SSF) {
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

