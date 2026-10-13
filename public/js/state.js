/*
 * state.js — 인증, 권한, Firestore 실시간 상태와 업무 데이터 공용 함수.
 * 화면은 render.js, 초기 구동은 main.js가 맡습니다.
 */

const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const DEPARTMENTS = [
  { id: 'planning', name: '기획' },
  { id: 'ui', name: 'UI' },
  { id: 'development', name: '개발' },
  { id: 'business', name: '글비' },
  { id: 'server', name: '서버' },
  { id: 'qa', name: 'QA' },
  { id: 'video', name: '영상' },
  { id: 'video_partner', name: '영상 파트너' },
  { id: 'studio', name: '제작실' },
  { id: 'pm', name: 'PM' }
];
const TASK_STATUS = {
  todo: '미착수', in_progress: '진행 중', blocked: '차단됨', done: '완료'
};
// 프로젝트의 "고정 일정"과 실제 실무 업무를 분리합니다. 고정 일정만 바뀌면
// scheduleRule을 가진 자동 생성 업무는 같은 규칙으로 다시 계산할 수 있습니다.
const PLATFORMS = [
  { id: 'pc', name: 'PC' },
  { id: 'mobile', name: '모바일' },
  { id: 'console', name: '콘솔' }
];
const DELIVERY_MILESTONES = [
  { key: 'demo_build', title: '데모 빌드 마감' },
  { key: 'demo_release', title: '데모 출시' },
  { key: 'full_build', title: '완전판 빌드 마감' },
  { key: 'full_release', title: '완전판 출시' }
];
// 업무 화면은 직군이 아니라 이 실행 단위로 먼저 묶습니다. 새 업무는 phaseId를
// 명시적으로 저장하고, 기존 엑셀 업무는 taskGroup 텍스트로 안전하게 추론합니다.
const PROJECT_TASK_PHASES = [
  { id: 'idea', title: '아이디어' },
  { id: 'preparation', title: '준비' },
  { id: 'detail_planning', title: '세부 기획' },
  { id: 'demo', title: '데모' },
  { id: 'full', title: '완전판' },
  { id: 'other', title: '기타 업무' }
];
const TEMPLATE_DEPARTMENTS = ['planning', 'ui', 'development', 'qa'];
// 현재 전달받은 기획·UI 마일스톤에서 반복되는 흐름을 기준으로 한 첫 템플릿입니다.
// 실제 운영 중 평균 작업일은 템플릿 관리 화면에서 계속 조정할 수 있게 확장합니다.
const PROJECT_WORK_TEMPLATE = [
  { key: 'demo-plan', phaseId: 'detail_planning', departmentId: 'planning', title: '데모 기능·화면 기획 확정', anchorKey: 'demo_build', dueOffset: -18, estimatedDays: 3 },
  { key: 'demo-ui-design', phaseId: 'demo', departmentId: 'ui', title: '데모 UI 디자인', anchorKey: 'demo_build', dueOffset: -15, estimatedDays: 4, dependsOnKey: 'demo-plan' },
  { key: 'demo-ui-prefab', phaseId: 'demo', departmentId: 'ui', title: '데모 UI 프리팹·연출', anchorKey: 'demo_build', dueOffset: -9, estimatedDays: 3, dependsOnKey: 'demo-ui-design' },
  { key: 'demo-dev', phaseId: 'demo', departmentId: 'development', title: '데모 기능 구현·연동', anchorKey: 'demo_build', dueOffset: -10, estimatedDays: 5, dependsOnKey: 'demo-plan' },
  { key: 'demo-qa', phaseId: 'demo', departmentId: 'qa', title: '데모 QA·수정 확인', anchorKey: 'demo_build', dueOffset: -4, estimatedDays: 3, dependsOnKey: 'demo-ui-prefab' },
  { key: 'full-plan', phaseId: 'full', departmentId: 'planning', title: '완전판 기능·화면 기획 확정', anchorKey: 'full_build', dueOffset: -28, estimatedDays: 4 },
  { key: 'full-ui-design', phaseId: 'full', departmentId: 'ui', title: '완전판 UI 디자인', anchorKey: 'full_build', dueOffset: -22, estimatedDays: 5, dependsOnKey: 'full-plan' },
  { key: 'full-ui-prefab', phaseId: 'full', departmentId: 'ui', title: '완전판 UI 프리팹·연출', anchorKey: 'full_build', dueOffset: -14, estimatedDays: 4, dependsOnKey: 'full-ui-design' },
  { key: 'full-dev', phaseId: 'full', departmentId: 'development', title: '완전판 기능 구현·연동', anchorKey: 'full_build', dueOffset: -15, estimatedDays: 7, dependsOnKey: 'full-plan' },
  { key: 'full-qa', phaseId: 'full', departmentId: 'qa', title: '완전판 QA·수정 확인', anchorKey: 'full_build', dueOffset: -6, estimatedDays: 4, dependsOnKey: 'full-ui-prefab' }
];

let projectTemplateCatalogPromise = null;

function loadProjectTemplateCatalog(){
  if(!window.ProjectTemplateEngine) return Promise.reject(new Error('프로젝트 템플릿 엔진을 불러오지 못했습니다.'));
  if(!projectTemplateCatalogPromise) {
    projectTemplateCatalogPromise = fetch('docs/project-template-tables.json', { cache: 'no-store' })
      .then(response => {
        if(!response.ok) throw new Error(`템플릿 데이터를 불러오지 못했습니다. (${response.status})`);
        return response.json();
      })
      .then(catalog => {
        window.ProjectTemplateEngine.assertValidCatalog(catalog);
        return catalog;
      })
      .catch(error => {
        projectTemplateCatalogPromise = null;
        throw error;
      });
  }
  return projectTemplateCatalogPromise;
}

let currentUser = null;
let currentProfile = null;
let authResolved = false;
let activeView = 'home';
let selectedProjectId = null;
let projectDetailTab = 'schedule';
const projectTaskViewStates = new Map();
const personalTaskViewStates = new Map();
let projectTimelineFilter = 'all';
let projectScheduleCursor = null;
let projectScheduleSelectedDate = null;
let projectPortfolioCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let workViewMode = 'list';
let workPeriod = 'today';
let peopleView = 'department';
let workCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let capacityWeekCursor = new Date();
let projects = [];
let tasks = [];
let milestones = [];
let projectUpdates = [];
let assignmentHistory = [];
let holidays = [];
let visibleUsers = [];
let accessRequests = [];
// 업무량·가용 시간은 업무와 공휴일 데이터를 모두 받은 뒤에만 확정합니다.
let workDataReadiness = { tasks: false, holidays: false };
let profileLookup = { status: 'idle', uid: '', message: '' };
let importPreview = null;

let profileUnsubscribe = null;
let dataUnsubscribers = [];
let scopedProjectUnsubscribers = [];
const memberProjectScopes=new Map();
const dataLoading=new Set(),dataIssues=new Map();
let historyRequest=0;
let historyPage={projectId:'',status:'idle',items:[],cursor:null,hasMore:false,error:''};
let memberScopeKey = '';
let memberScopeOwnTasks = [];
let memberScopePublish = null;
let projectMemberships = [];
let declaredProjectIds = [];
let scopeGeneration = 0;
let dataGeneration = 0;
let authGeneration = 0;
let authAccountGeneration = 0;
let dataRenderPending = false;
let snapshotSequence = 0;
const snapshotVersions = new WeakMap();

function requestDataRender(){
  if(dataRenderPending)return;
  dataRenderPending=true;
  const generation=dataGeneration;
  const flush=()=>{
    if(generation!==dataGeneration)return;
    dataRenderPending=false;
    rerenderSafely();
  };
  if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(flush);
  else Promise.resolve().then(flush);
}

function invalidateSessionUI(){
  authGeneration++;
  historyRequest++;historyPage={projectId:'',status:'idle',items:[],cursor:null,hasMore:false,error:''};
  if(typeof closeSessionDialogs==='function')closeSessionDialogs();
}
function assertCurrentSession(generation){
  if(generation!==authGeneration)throw new Error('로그인 또는 권한이 변경되어 작업을 중단했습니다. 다시 확인해주세요.');
}
function installConnectionMonitoring(){
  if(window.scheduleConnectionMonitoring)return;
  window.scheduleConnectionMonitoring=true;
  window.addEventListener('online',requestDataRender);window.addEventListener('offline',requestDataRender);
}

function setAppStatus(message){
  const el = document.getElementById('appStatus');
  if(el) el.textContent = message;
}

function rerenderSafely(){
  // 브라우저가 스크립트 전역을 분리해 해석하는 경우에도 화면 모듈을 확실히 호출합니다.
  const renderApp = window.renderScheduleApp || (typeof rerender === 'function' ? rerender : null);
  if(typeof renderApp === 'function') renderApp();
}

function resetDataSubscriptions(){
  scopeGeneration++;
  dataGeneration++;
  dataRenderPending=false;
  dataUnsubscribers.forEach(unsub => unsub());
  scopedProjectUnsubscribers.forEach(unsub => unsub());
  memberProjectScopes.forEach(entry=>entry.active=false);memberProjectScopes.clear();
  dataLoading.clear();dataIssues.clear();historyRequest++;
  historyPage={projectId:'',status:'idle',items:[],cursor:null,hasMore:false,error:''};
  dataUnsubscribers = [];
  scopedProjectUnsubscribers = [];
  memberScopeKey = '';
  memberScopeOwnTasks = [];
  memberScopePublish = null;
  projectMemberships = [];declaredProjectIds = [];
  projects = [];
  tasks = [];
  milestones = [];
  projectUpdates = [];
  assignmentHistory = [];
  holidays = [];
  visibleUsers = [];
  accessRequests = [];
  workDataReadiness = { tasks: false, holidays: false };
}

function isWorkDataReady(){ return workDataReadiness.tasks && workDataReadiness.holidays; }

function docToObject(doc){
  const value={id:doc.id,...doc.data()};
  const stamp=value.updatedAt||value.createdAt;
  const time=stamp?.toMillis?.()||(stamp instanceof Date?stamp.getTime():typeof stamp==='string'?Date.parse(stamp):0)||0;
  snapshotVersions.set(value,{time,nanos:typeof stamp?.nanoseconds==='number'?stamp.nanoseconds%1000000:0,pending:doc.metadata?.hasPendingWrites===true,sequence:++snapshotSequence});
  return value;
}
function mergeTaskSnapshots(...sources){
  const merged=new Map();
  for(const task of sources.flat()){
    const previous=merged.get(task.id);
    if(!previous){merged.set(task.id,task);continue;}
    const a=snapshotVersions.get(previous)||{time:0,nanos:0,pending:false,sequence:0};
    const b=snapshotVersions.get(task)||{time:0,nanos:0,pending:false,sequence:0};
    // Pending timestamps can be null; a later committed snapshot must also clear them.
    const newer=a.pending!==b.pending?b.sequence>a.sequence:
      b.time!==a.time?b.time>a.time:b.nanos!==a.nanos?b.nanos>a.nanos:b.sequence>=a.sequence;
    if(newer)merged.set(task.id,task);
  }
  return [...merged.values()];
}
function workRole(profile = currentProfile){ return profile?.role === 'admin' ? 'pm' : profile?.role || 'member'; }
// 관리자 권한은 시스템 관리 권한이고, PM은 프로젝트 운영 역할입니다.
// 이전 role: admin 문서는 전환 기간 동안 관리자 권한으로 취급합니다.
function isAdmin(){ return currentProfile?.isAdmin === true || currentProfile?.role === 'admin'; }
function isPM(){ return workRole() === 'pm'; }
function isLead(){ return workRole() === 'lead'; }
function isMember(){ return workRole() === 'member'; }
function isApproved(){ return !!currentProfile?.active; }
function userRoleLabel(profile){
  const title = workRole(profile) === 'pm' ? 'PM' : workRole(profile) === 'lead' ? '팀장' : '팀원';
  return profile?.isAdmin === true || profile?.role === 'admin' ? `관리자 · ${title}` : title;
}
function departmentName(id){ return DEPARTMENTS.find(x => x.id === id)?.name || id || '미지정'; }
function platformName(id){ return PLATFORMS.find(item => item.id === id)?.name || id || '공통'; }
function dateOnly(value){
  if(!value) return '';
  if(value?.toDate) return dateKey(value.toDate());
  return String(value).slice(0, 10);
}
function activeUsers(){ return visibleUsers.filter(user => user.active); }
function personName(userId){
  if(userId === currentUser?.uid) return currentProfile?.name || currentUser?.displayName || currentUser?.email || '이름 미지정';
  const user = visibleUsers.find(item => item.id === userId);
  return user?.name || user?.email || '담당자 미확인';
}

function normalizeTask(input){
  const task = { ...input };
  task.status = Object.hasOwn(TASK_STATUS, task.status) ? task.status : 'todo';
  task.progress = Number(task.progress || 0);
  if(task.status === 'todo') task.progress = 0;
  if(task.status === 'done') task.progress = 100;
  if(task.status === 'in_progress') task.progress = Math.min(99, Math.max(1, task.progress || 1));
  task.progress = Math.min(100, Math.max(0, task.progress));
  task.archivedAt = task.archivedAt || null;
  task.dependsOn = Array.isArray(task.dependsOn) ? [...new Set(task.dependsOn.filter(Boolean))] : (task.dependsOn ? [task.dependsOn] : []);
  task.milestoneId = task.milestoneId || null;
  task.platform = task.platform || null;
  task.generated = task.generated === true;
  task.estimatedDays = Math.max(0, Number(task.estimatedDays || 0));
  const rawAssignees = Array.isArray(task.assignees) && task.assignees.length ? task.assignees : (task.assigneeId ? [{ userId: task.assigneeId, share: 1, role: 'primary' }] : (task.assigneeIds || []).map((userId, index) => ({ userId, share: 1, role: index === 0 ? 'primary' : 'co' })));
  const uniqueAssignees = [...new Map(rawAssignees.filter(item => item?.userId).map(item => [item.userId, item])).values()];
  const primaryIndex = Math.max(0, uniqueAssignees.findIndex(item => item.userId === task.assigneeId || item.role === 'primary'));
  const orderedAssignees = uniqueAssignees.length ? [uniqueAssignees[primaryIndex], ...uniqueAssignees.filter((_, index) => index !== primaryIndex)] : [];
  const totalShare = orderedAssignees.reduce((sum, item) => sum + Number(item.share || 0), 0);
  task.assignees = orderedAssignees.map((item, index) => ({ userId: item.userId, share: totalShare ? Number(item.share || 0) / totalShare : 1 / orderedAssignees.length, role: index === 0 ? 'primary' : 'co' }));
  task.assigneeId = task.assignees[0]?.userId || null;
  task.assigneeIds = task.assignees.map(item => item.userId);
  if(Object.hasOwn(task, 'supporterIds')) task.supporterIds = task.assigneeIds.filter(id => id !== task.assigneeId);
  return task;
}

function primaryAssignmentFields(userId, name = null){
  return {
    assigneeId: userId || null,
    assigneeName: userId ? (name || personName(userId)) : '담당자 미배정',
    assignees: userId ? [{ userId, share: 1, role: 'primary' }] : [],
    assigneeIds: userId ? [userId] : [],
    needsAssignment: !userId
  };
}

function activeTasks(){ return tasks.filter(task => !task.archivedAt); }
function taskIsOverdue(task){
  return !task.archivedAt && task.status !== 'done' && !!task.dueDate && dateOnly(task.dueDate) < dateKey(new Date());
}
function timestampMillis(value){ return value?.toMillis ? value.toMillis() : 0; }
function updatesForProject(projectId){ return projectUpdates.filter(update => update.projectId === projectId).sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt)); }
function tasksForProject(projectId){ return activeTasks().filter(task => task.projectId === projectId); }
function milestonesForProject(projectId){ return milestones.filter(milestone => milestone.projectId === projectId && !milestone.archivedAt); }
function tasksForMilestone(milestoneId){ return activeTasks().filter(task => task.milestoneId === milestoneId); }
function milestoneProgress(milestoneId){
  const list = tasksForMilestone(milestoneId);
  if(!list.length) return null;
  return Math.round(list.reduce((sum, task) => sum + task.progress, 0) / list.length);
}
function taskDependencies(task){ return [...new Set([...(task?.readinessDependsOn || []), ...(['before_task','during_task'].includes(task?.scheduleRule?.type) ? [] : task?.dependsOn || [])])].map(id => tasks.find(item => item.id === id)).filter(Boolean); }
function taskHasUnfinishedDependencies(task){ return taskDependencies(task).some(dependency => dependency.status !== 'done'); }
function localDate(value){
  if(!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const result = new Date(year, month - 1, day); return isNaN(result) ? null : result;
}
function dateKey(date){ return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function isHoliday(date){ return holidays.some(item => item.id === dateKey(date) || item.date === dateKey(date)); }
function isWeekday(date){ return date.getDay() !== 0 && date.getDay() !== 6 && !isHoliday(date); }
function addBusinessDays(value, amount){
  const date = localDate(value);
  if(!date) return null;
  const direction = amount < 0 ? -1 : 1;
  let remaining = Math.abs(Number(amount || 0));
  while(remaining > 0) {
    date.setDate(date.getDate() + direction);
    if(isWeekday(date)) remaining--;
  }
  return dateKey(date);
}
function scheduledDates(anchorDate, dueOffset, estimatedDays){
  if(!anchorDate) return { startDate: null, dueDate: null };
  const dueDate = addBusinessDays(anchorDate, dueOffset);
  return { dueDate, startDate: addBusinessDays(dueDate, -(Math.max(1, Number(estimatedDays || 1)) - 1)) };
}
function projectMilestoneMap(projectId, overrides = {}){
  const result = { ...overrides };
  milestonesForProject(projectId).forEach(item => { if(item.anchorKey && !result[item.anchorKey]) result[item.anchorKey] = item.dueDate; });
  return result;
}
function staffingFor(project, platform, departmentId){
  return (project?.staffing || []).find(item => item.platform === platform && item.departmentId === departmentId) || null;
}
function templateTaskKey(platform, templateKey){ return `${platform}:${templateKey}`; }
function projectTaskPhase(task){
  const stage = projects.find(item => item.id === task?.projectId)?.stageSnapshots?.find(item => item.id === (task.stageId || task.phaseId));
  if(stage) return { ...stage, title: stage.name };
  const legacyPhase = { demo_prepare: 'demo', demo_launch: 'demo', full_prepare: 'full', full_launch: 'full' }[task?.phaseId] || task?.phaseId;
  const explicit = PROJECT_TASK_PHASES.find(phase => phase.id === legacyPhase);
  if(explicit) return explicit;
  const text = `${task?.taskGroup || ''} ${task?.title || ''}`.replace(/\s/g, '').toLowerCase();
  if(/현장.?방문|로케이션|리소스|자료.?검수|에셋.?검수/.test(text)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'other');
  if(/데모/.test(text) || ['demo_build', 'demo_release'].includes(task?.scheduleRule?.anchorKey)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'demo');
  if(/완전판|정식/.test(text) || ['full_build', 'full_release'].includes(task?.scheduleRule?.anchorKey)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'full');
  if(/아이디어|브레인스토밍|컨셉/.test(text)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'idea');
  if(/준비|사전/.test(text)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'preparation');
  if(/세부.?기획|기획/.test(text)) return PROJECT_TASK_PHASES.find(phase => phase.id === 'detail_planning');
  return PROJECT_TASK_PHASES.find(phase => phase.id === 'other');
}
function taskCoversDate(task, date){
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  if(!start || !end) return false;
  return date >= start && date <= end;
}
function assignmentShareFor(task, userId){
  const item = (task.assignees || []).find(assignee => assignee.userId === userId);
  return item ? Number(item.share || 0) : (task.assigneeId === userId ? 1 : 0);
}
function taskDailyLoad(task, date, userId = task.assigneeId){
  if(task.status === 'done' || !task.estimatedDays || !taskCoversDate(task, date) || !isWeekday(date)) return 0;
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  let workingDays = 0;
  for(let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) if(isWeekday(cursor)) workingDays++;
  return workingDays ? (task.estimatedDays / workingDays) * assignmentShareFor(task, userId) : 0;
}
function userWeeklyCapacity(userId){
  const user = userId === currentUser?.uid ? currentProfile : visibleUsers.find(item => item.id === userId);
  return Math.max(1, Number(user?.weeklyCapacity || 5));
}
function userDailyCapacity(userId){ return userWeeklyCapacity(userId) / 5; }
function scheduleWeekKey(date){
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return dateKey(monday);
}
function taskLoadForUserOnDate(userId, date, extraTask = null){
  const list = activeTasks().filter(task => assignmentShareFor(task, userId) > 0 && task.status !== 'done' && task.id !== extraTask?.id);
  if(extraTask) list.push(extraTask);
  return list.reduce((sum, task) => sum + taskDailyLoad(task, date, userId), 0);
}
function nextAvailableDate(userId, extraTask = null){
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  for(let index = 0; index < 90; index++) {
    if(isWeekday(cursor) && taskLoadForUserOnDate(userId, cursor, extraTask) < userDailyCapacity(userId) * .8) return dateKey(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}
function assignmentAssessment(userId, task, keepSharedAssignees = false){
  if(!userId || !task) return { level: 'unknown', label: '담당자를 선택해주세요.', weeklyLoad: 0, nextDate: null, overflowDays: 0 };
  const candidate = normalizeTask({ ...task, assigneeId: keepSharedAssignees ? task.assigneeId : userId, assignees: keepSharedAssignees ? task.assignees : [{ userId, share: 1, role: 'primary' }], status: task.status || 'todo' });
  const missingDates = !candidate.startDate || !candidate.dueDate || (!candidate.assessmentOnly && !candidate.estimatedDays);
  const start = localDate(candidate.startDate || dateKey(new Date()));
  const end = localDate(candidate.dueDate || candidate.startDate || dateKey(new Date()));
  const weeklyLoads = new Map();
  let overflowDays = 0;
  for(let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if(!isWeekday(cursor)) continue;
    const load = taskLoadForUserOnDate(userId, cursor, candidate);
    const week = scheduleWeekKey(cursor);
    weeklyLoads.set(week, (weeklyLoads.get(week) || 0) + load);
    if(load > userDailyCapacity(userId)) overflowDays++;
  }
  const peakWeeklyLoad = Math.max(0, ...weeklyLoads.values());
  const weeklyLoad = Math.round((peakWeeklyLoad / userWeeklyCapacity(userId)) * 100);
  const nextDate = nextAvailableDate(userId, candidate);
  if(missingDates) return { level: 'unknown', label: '기간과 예상 작업일을 입력하면 가용성을 계산할 수 있습니다.', weeklyLoad, nextDate, overflowDays };
  if(overflowDays > 0 || weeklyLoad > 100) return { level: 'danger', label: `기존 업무와 ${overflowDays || 1}일 겹쳐 과부하가 예상됩니다.`, weeklyLoad, nextDate, overflowDays };
  if(weeklyLoad >= 80) return { level: 'warn', label: '업무량이 높은 편입니다. 마감일까지 완료 가능 여부를 확인해주세요.', weeklyLoad, nextDate, overflowDays };
  return { level: 'ok', label: '마감일 내 완료 가능한 여유가 있습니다.', weeklyLoad, nextDate, overflowDays };
}
function wouldCreateDependencyCycle(taskId, candidateId, taskList = tasks){
  if(!taskId || !candidateId) return false;
  const visit = (id, visited = new Set()) => {
    if(id === taskId) return true;
    if(visited.has(id)) return false;
    visited.add(id);
    const task = taskList.find(item => item.id === id);
    return !!task && (task.dependsOn || []).some(parentId => visit(parentId, visited));
  };
  return visit(candidateId);
}
function projectProgress(projectId){
  const list = tasksForProject(projectId);
  if(!list.length) return null;
  return Math.round(list.reduce((sum, task) => sum + task.progress, 0) / list.length);
}
function canEditTask(task){
  if(!currentProfile || !task || !isApproved()) return false;
  if(isAdmin() || isPM()) return true;
  if(isLead()) return task.departmentId === currentProfile.departmentId;
  return task.assigneeId === currentUser?.uid;
}
function canManageTaskAssignment(task){
  // 담당자는 본인 업무를 다른 활성 구성원에게 이관할 수 있습니다.
  // 팀장·PM·관리자는 기존처럼 업무 배정 전반을 관리합니다.
  return !!task && isApproved() && (isAdmin() || isPM() || (isLead() && task.departmentId === currentProfile.departmentId) || task.assigneeId === currentUser?.uid);
}
function canManageScheduleLinks(task){
  return !!task && isApproved() && (isAdmin() || isPM() || (isLead() && task.departmentId===currentProfile.departmentId));
}
function taskScheduleSignature(task){
  return JSON.stringify({
    start:dateOnly(task.startDate),due:dateOnly(task.dueDate),status:task.status || 'todo',
    dependsOn:task.dependsOn || [],rule:task.scheduleRule || null,policy:task.datePolicy || null,days:task.estimatedDays || 0,
    locked:!!task.dateLocked,override:!!task.dateOverride,mode:task.scheduleMode || null,
    archived:!!task.archivedAt,review:task.scheduleReview || null,
    assigneeId:task.assigneeId || null,assigneeIds:task.assigneeIds || [],supporters:task.supporterIds || [],
    deadlines:task.deadlineRules || [],steps:task.scheduleSteps || [],stepDates:task.scheduleStepDates || {},readiness:task.readinessDependsOn || []
  });
}
// Compare the document opened by the editor with the server document before writing.
// Firestore timestamps need a stable representation; document IDs are not stored fields.
function taskEditSignature(task){
  const canonical = value => {
    if(value && typeof value.toMillis === 'function') return value.toMillis();
    if(value instanceof Date) return value.getTime();
    if(Array.isArray(value)) return value.map(canonical);
    if(value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
    return value;
  };
  const {id,...stored} = task || {};
  return JSON.stringify(canonical(stored));
}
function canCreateTask(departmentId, assigneeId = currentUser?.uid){
  return isApproved() && (isAdmin() || isPM() || (isLead() && currentProfile.departmentId === departmentId) || assigneeId === currentUser?.uid);
}
function canManageProjects(){ return isApproved() && (isAdmin() || isPM()); }
function canManageOffboarding(user){ return isApproved() && !!user && (isAdmin() || (isLead() && user.departmentId === currentProfile.departmentId)); }

async function requestGoogleLogin(){
  try {
    await auth.signInWithPopup(googleProvider);
  } catch(error) {
    console.error('로그인 실패:', error);
    setAppStatus('로그인에 실패했습니다');
    alert('Google 로그인에 실패했습니다. 팝업 차단 또는 Firebase Authentication 설정을 확인해주세요.');
  }
}

async function signOut(){ await auth.signOut(); }

async function createAccessRequest(user){
  // 역할·부서 필드는 절대 클라이언트에서 쓰지 않습니다. 보안 규칙도 이 필드만 허용해야 합니다.
  await db.collection('accessRequests').doc(user.uid).set({
    email: user.email || '',
    name: user.displayName || '',
    requestedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function subscribeCollection(query, apply, label){
  const generation=dataGeneration;
  dataLoading.add(label);
  const unsubscribe = query.onSnapshot(snapshot => {
    if(generation!==dataGeneration)return;
    apply(snapshot.docs.map(docToObject));
    dataLoading.delete(label);dataIssues.delete(label);
    requestDataRender();
  }, error => {
    if(generation!==dataGeneration)return;
    console.error(`${label} 구독 실패:`, error);
    dataLoading.delete(label);dataIssues.set(label,{label,error});
    if(error.code==='permission-denied')apply([]);
    requestDataRender();
  });
  dataUnsubscribers.push(unsubscribe);
}

function subscribeProjectScopeForMember(ownTasks){
  const projectIds=[...new Set([...declaredProjectIds,...projectMemberships.map(item=>item.projectId),...ownTasks.map(task=>task.projectId)].filter(Boolean))].sort();
  memberScopeOwnTasks=ownTasks;memberScopeKey=JSON.stringify(projectIds);
  const wanted=new Set(projectIds),generation=scopeGeneration;
  for(const [id,entry] of memberProjectScopes){
    if(wanted.has(id))continue;
    entry.active=false;entry.unsubscribers.forEach(unsub=>unsub());memberProjectScopes.delete(id);
    for(const key of entry.keys){dataLoading.delete(key);dataIssues.delete(key);}
  }
  const publish=()=>{
    if(generation!==scopeGeneration)return;
    const entries=[...memberProjectScopes.values()];
    projects=entries.map(entry=>entry.project).filter(Boolean).sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name)));
    tasks=mergeTaskSnapshots(memberScopeOwnTasks,entries.flatMap(entry=>entry.tasks));
    milestones=entries.flatMap(entry=>entry.milestones);projectUpdates=entries.flatMap(entry=>entry.updates);
    requestDataRender();
  };
  memberScopePublish=publish;
  for(const id of projectIds){
    if(memberProjectScopes.has(id))continue;
    const entry={active:true,project:null,tasks:[],milestones:[],updates:[],unsubscribers:[],keys:[]};memberProjectScopes.set(id,entry);
    const watch=(query,field,label,document=false)=>{
      const key=`project:${id}:${field}`;entry.keys.push(key);dataLoading.add(key);
      const valid=()=>entry.active&&generation===scopeGeneration&&memberProjectScopes.get(id)===entry;
      const unsubscribe=query.onSnapshot(snapshot=>{
        if(!valid())return;
        entry[field]=document?(snapshot.exists?docToObject(snapshot):null):snapshot.docs.map(docToObject);
        dataLoading.delete(key);dataIssues.delete(key);publish();
      },error=>{
        if(!valid())return;
        dataLoading.delete(key);dataIssues.set(key,{label,error});
        // A revoked query must not leave its previous contents visible.
        if(error.code==='permission-denied')entry[field]=document?null:[];
        publish();
      });
      entry.unsubscribers.push(unsubscribe);
    };
    watch(db.collection('projects').doc(id),'project','프로젝트',true);
    watch(db.collection('tasks').where('projectId','==',id),'tasks','프로젝트 업무');
    watch(db.collection('milestones').where('projectId','==',id),'milestones','프로젝트 주요 일정');
    watch(db.collection('projectUpdates').where('projectId','==',id),'updates','프로젝트 업데이트');
  }
  scopedProjectUnsubscribers=[...memberProjectScopes.values()].flatMap(entry=>entry.unsubscribers);
  publish();
}
function subscribeApprovedData(){
  resetDataSubscriptions();
  if(isAdmin() || isPM()) {
    subscribeCollection(db.collection('projects'), data => { projects = data; }, '프로젝트');
    subscribeCollection(db.collection('tasks'), data => { tasks = data; workDataReadiness.tasks = true; }, '업무');
    subscribeCollection(db.collection('milestones'), data => { milestones = data; }, '마일스톤');
    subscribeCollection(db.collection('projectUpdates'), data => { projectUpdates = data; }, '프로젝트 업데이트');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; workDataReadiness.holidays = true; }, '공휴일');
    subscribeCollection(db.collection('users'), data => { visibleUsers = data; }, '사용자');
    // 승인 요청은 사용자 권한 관리 화면을 보는 관리자만 필요합니다.
    if(isAdmin()) subscribeCollection(db.collection('accessRequests'), data => { accessRequests = data; }, '승인 요청');
  } else if(isLead()) {
    let teamTasks=[],ownShared=[];
    const publishTeam=()=>subscribeProjectScopeForMember(mergeTaskSnapshots(teamTasks,ownShared));
    subscribeCollection(db.collection('tasks').where('departmentId', '==', currentProfile.departmentId), data => {teamTasks=data;workDataReadiness.tasks=true;publishTeam();}, '팀 업무');
    subscribeCollection(db.collection('tasks').where('assigneeIds', 'array-contains', currentUser.uid), data => {ownShared=data;publishTeam();}, '내 공동 업무');
    subscribeCollection(db.collection('projects').where('participantDepartmentIds','array-contains',currentProfile.departmentId),data=>{declaredProjectIds=data.map(item=>item.id);publishTeam();},'팀 참여 프로젝트');
    subscribeCollection(db.collection('projectMembers').where('userId','==',currentUser.uid),data=>{projectMemberships=data;publishTeam();},'프로젝트 참여');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; workDataReadiness.holidays = true; }, '공휴일');
    subscribeCollection(db.collection('users').where('departmentId', '==', currentProfile.departmentId), data => { visibleUsers = data; }, '팀원');
  } else {
    let primaryTasks = [], supportTasks = [];
    let primaryLoaded = false, supportLoaded = false;
    const publishOwnTasks = () => {
      const ownTasks = mergeTaskSnapshots(primaryTasks,supportTasks);
      if(primaryLoaded && supportLoaded) { tasks = ownTasks; workDataReadiness.tasks = true; }
      subscribeProjectScopeForMember(ownTasks);
    };
    subscribeCollection(db.collection('tasks').where('assigneeId', '==', currentUser.uid), data => {
      primaryTasks = data; primaryLoaded = true; publishOwnTasks();
    }, '내 주 담당 업무');
    subscribeCollection(db.collection('tasks').where('assigneeIds', 'array-contains', currentUser.uid), data => {
      supportTasks = data; supportLoaded = true; publishOwnTasks();
    }, '내 지원 업무');
    subscribeCollection(db.collection('projectMembers').where('userId','==',currentUser.uid),data=>{projectMemberships=data;publishOwnTasks();},'프로젝트 참여');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; workDataReadiness.holidays = true; }, '공휴일');
  }
}

function handleProfile(profile){
  const accessKey=value=>value?.active?JSON.stringify([value.id,value.role,value.isAdmin===true,value.departmentId]):'';
  const sameAccess=accessKey(currentProfile)===accessKey(profile);
  if(!sameAccess)invalidateSessionUI();
  currentProfile = profile?.active ? profile : null;
  if(!currentProfile) {
    resetDataSubscriptions();
    setAppStatus('승인 대기 중');
  } else {
    if(sameAccess){rerenderSafely();return;}
    activeView = 'home';
    // 사용자 정보는 상단 계정 영역에서 한 번만 보여줍니다. 상태 영역은 오류·로딩 안내에만 사용합니다.
    setAppStatus('');
    subscribeApprovedData();
  }
  rerenderSafely();
}

async function loadAssignmentHistory(projectId,{more=false}={}){
  if(!canManageProjects()||!projects.some(project=>project.id===projectId))return;
  if(historyPage.status==='loading'&&historyPage.projectId===projectId)return;
  if(more&&(historyPage.projectId!==projectId||!historyPage.hasMore))return;
  const request=++historyRequest,session=authGeneration;
  const previous=more?historyPage.items:[];
  const cursor=more?historyPage.cursor:null;
  historyPage={projectId,status:'loading',items:previous,cursor,hasMore:false,error:''};requestDataRender();
  try{
    let query=db.collection('assignmentHistory').where('projectId','==',projectId).orderBy('changedAt','desc');
    if(cursor)query=query.startAfter(cursor);
    const snapshot=await query.limit(31).get();
    if(request!==historyRequest||session!==authGeneration)return;
    const page=snapshot.docs.slice(0,30);
    historyPage={projectId,status:'ready',items:[...new Map([...previous,...page.map(docToObject)].map(item=>[item.id,item])).values()],cursor:page.at(-1)||cursor,hasMore:snapshot.docs.length>30,error:'',cached:snapshot.metadata?.fromCache===true};
  }catch(error){
    if(request!==historyRequest||session!==authGeneration)return;
    historyPage={projectId,status:'error',items:previous,cursor,hasMore:more,error:error.code==='failed-precondition'?'조회 준비가 필요합니다. 관리자에게 문의해주세요.':'이력을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.'};
    console.error('배정 이력 조회 실패:',error);
  }
  requestDataRender();
}

function startAuth(){
  if(typeof window.addEventListener==='function')installConnectionMonitoring();
  // 네트워크·브라우저 확장 프로그램 등으로 인증 초기 응답이 지연돼도 빈 화면에 머물지 않게 합니다.
  const authFallbackTimer = setTimeout(() => {
    if(authResolved) return;
    authResolved = true;
    setAppStatus('로그인 상태를 확인해주세요');
    rerenderSafely();
  }, 4000);
  auth.onAuthStateChanged(async user => {
    invalidateSessionUI();
    const generation=++authAccountGeneration;
    authResolved = true;
    clearTimeout(authFallbackTimer);
    if(profileUnsubscribe) { profileUnsubscribe(); profileUnsubscribe = null; }
    resetDataSubscriptions();
    currentUser = user;
    currentProfile = null;
    if(!user) {
      activeView = 'home';
      profileLookup = { status: 'idle', uid: '', message: '' };
      setAppStatus('로그인이 필요합니다');
      rerenderSafely();
      return;
    }
    profileLookup = { status: 'checking', uid: user.uid, message: '' };
    setAppStatus('권한을 확인하는 중…');
    let profileResponse=0;
    profileUnsubscribe = db.collection('users').doc(user.uid).onSnapshot(async doc => {
      if(currentUser?.uid!==user.uid||generation!==authAccountGeneration)return;
      const response=++profileResponse;
      const isCurrent=()=>currentUser?.uid===user.uid&&generation===authAccountGeneration&&response===profileResponse;
      if(!doc.exists) {
        // 최초 구독은 브라우저 캐시의 오래된 "문서 없음" 상태를 받을 수 있습니다.
        // 서버를 한 번 직접 확인해 실제 관리자 문서가 있으면 즉시 반영합니다.
        try {
          const serverDoc = await db.collection('users').doc(user.uid).get({ source: 'server' });
          if(!isCurrent())return;
          if(serverDoc.exists) {
            const profile = { id: serverDoc.id, ...serverDoc.data() };
            profileLookup = {
              status: profile.active === true ? 'approved' : 'inactive', uid: user.uid,
              message: `role=${profile.role || '없음'}, active=${String(profile.active)}`
            };
            handleProfile(profile);
            return;
          }
        } catch(error) {
          if(!isCurrent())return;
          profileLookup = { status: 'error', uid: user.uid, message: error.code || error.message || 'unknown' };
          console.error('서버 권한 정보 확인 실패:', error);
          setAppStatus('권한 정보를 확인할 수 없습니다');
          handleProfile(null);
          return;
        }
        profileLookup = { status: 'missing', uid: user.uid, message: '' };
        try { await createAccessRequest(user); }
        catch(error) { console.error('승인 요청 생성 실패:', error); }
        if(!isCurrent())return;
        handleProfile(null);
        return;
      }
      const profile = { id: doc.id, ...doc.data() };
      profileLookup = {
        status: profile.active === true ? 'approved' : 'inactive', uid: user.uid,
        message: `role=${profile.role || '없음'}, active=${String(profile.active)}`
      };
      handleProfile(profile);
    }, error => {
      if(currentUser?.uid!==user.uid||generation!==authAccountGeneration)return;
      profileResponse++;
      handleProfile(null);
      profileLookup = { status: 'error', uid: user.uid, message: error.code || error.message || 'unknown' };
      console.error('권한 정보 확인 실패:', error);
      setAppStatus('권한 정보를 확인할 수 없습니다');
      rerenderSafely();
    });
  }, error => {
    clearTimeout(authFallbackTimer);
    authResolved = true;
    invalidateSessionUI();authAccountGeneration++;
    if(profileUnsubscribe){profileUnsubscribe();profileUnsubscribe=null;}
    resetDataSubscriptions();currentUser=null;currentProfile=null;
    console.error('인증 상태 확인 실패:', error);
    setAppStatus('인증 연결을 확인해주세요');
    rerenderSafely();
  });
}

function requirePermission(allowed, message){
  if(allowed) return true;
  alert(message || '이 작업을 할 권한이 없습니다.');
  return false;
}

async function saveTask(input){
  const session=authGeneration;
  const isNew = !input.id;
  const previous = isNew ? null : tasks.find(task => task.id === input.id);
  const expectedSignature = input.expectedTaskSignature || (previous ? taskEditSignature(previous) : null);
  if(!isNew && (!previous || previous.archivedAt || taskEditSignature(previous)!==expectedSignature)) throw new Error('업무가 변경되었거나 보관되었습니다. 입력을 복사해 둔 뒤 창을 다시 열어 최신 내용을 확인해주세요.');
  const departmentId = input.departmentId || previous?.departmentId;
  if(!requirePermission(isNew ? canCreateTask(departmentId) : canEditTask(previous), '이 업무를 수정할 권한이 없습니다.')) return;
  if(!input.title?.trim()) throw new Error('업무 제목을 입력해주세요.');
  const external = departmentId === 'video_partner';
  if(external && !canManageProjects()) throw new Error('외부 파트너 업무는 관리자 또는 PM만 수정할 수 있습니다.');
  if(external ? !input.externalAssigneeName?.trim() : !input.assigneeId) throw new Error(external ? '영상 파트너명을 입력해주세요.' : '담당자를 지정해주세요.');
  if(isNew && !canCreateTask(departmentId, input.assigneeId)) throw new Error('다른 사람의 업무는 팀장, PM 또는 관리자만 등록할 수 있습니다.');

  const data = normalizeTask({ ...previous, ...input, title: input.title.trim(), departmentId, assigneeName: personName(input.assigneeId), updatedBy: currentUser.uid });
  delete data.returnToAutomatic;
  delete data.expectedTaskSignature;
  const dependencyChanged = !!previous && JSON.stringify(previous.dependsOn || []) !== JSON.stringify(data.dependsOn);
  if(dependencyChanged && !canManageScheduleLinks(previous)) throw new Error('업무 연결 기준은 해당 직군 팀장, PM 또는 관리자만 변경할 수 있습니다.');
  if(dependencyChanged && ['after_task','before_task','during_task'].includes(data.scheduleRule?.type)) {
    data.scheduleRule = {...data.scheduleRule, predecessorIds:data.dependsOn, predecessorId:data.dependsOn[0] || null};
    if(data.scheduleRule.type === 'during_task' && data.dependsOn.length !== 1) throw new Error('기간 참여 업무는 기준 일정 하나를 선택해주세요.');
  }
  const durationChanged = !!previous && Number(previous.estimatedDays) !== data.estimatedDays;
  let recalculatedFromRule = false;
  if((durationChanged || dependencyChanged) && data.datePolicy !== 'anchor' && !data.dateOverride && !data.dateLocked && data.status !== 'done' && data.scheduleMode !== 'manual' &&
     dateOnly(previous.startDate) === dateOnly(data.startDate) && dateOnly(previous.dueDate) === dateOnly(data.dueDate) && window.DependencyScheduler?.dependencies(data).length) {
    if(!workDataReadiness.holidays) throw new Error('공휴일 데이터를 불러오는 중입니다.');
    const recommended = window.DependencyScheduler.recommendDates(data, window.DependencyScheduler.dependencies(data).map(id=>tasks.find(task=>task.id===id && task.projectId===data.projectId && !task.archivedAt)), holidays.map(item=>item.date || item.id));
    if(recommended) { Object.assign(data,recommended); recalculatedFromRule = true; }
  }
  const datesChanged = !!previous && (dateOnly(previous.startDate) !== dateOnly(data.startDate) || dateOnly(previous.dueDate) !== dateOnly(data.dueDate));
  if(['after_task','before_task','during_task'].includes(previous?.scheduleRule?.type) && data.datePolicy !== 'anchor' && datesChanged && !input.returnToAutomatic && !recalculatedFromRule) data.dateOverride = true;
  if(input.returnToAutomatic) {
    data.dateOverride = false; data.dateLocked = false; data.scheduleMode = 'automatic'; data.scheduleReview = null;
  }
  if(datesChanged && previous?.scheduleReview && !input.returnToAutomatic) data.scheduleReview = null;
  if(external) Object.assign(data, { assigneeId: null, assigneeIds: [], assignees: [], assigneeName: null, externalAssigneeName: input.externalAssigneeName.trim() });
  if(data.startDate && data.dueDate && data.dueDate < data.startDate) throw new Error('마감일이 시작일보다 빠릅니다.');
  if(isNew || canManageTaskAssignment(previous)) data.scheduleStatus = data.startDate && data.dueDate ? 'scheduled' : 'unscheduled';
  if(data.stageId) {
    const targetProject = projects.find(item => item.id === data.projectId);
    if(!targetProject?.stageSnapshots?.some(stage => stage.id === data.stageId)) throw new Error('선택한 단계가 프로젝트에 속하지 않습니다.');
  }
  const previousAssigneeIds = previous?.assigneeIds || previous?.assignees?.map(item => item.userId) || (previous?.assigneeId ? [previous.assigneeId] : []);
  const assignmentChanged = isNew || previousAssigneeIds.join('|') !== data.assigneeIds.join('|');
  if(!isNew && assignmentChanged && !canManageTaskAssignment(previous)) {
    throw new Error('담당자 변경은 PM, 관리자 또는 해당 부서 팀장만 할 수 있습니다.');
  }
  if(assignmentChanged) {
    const assessments = data.assignees.map(assignee => assignmentAssessment(assignee.userId, data, true));
    const overloaded = assessments.filter(assessment => assessment.level === 'danger');
    if(overloaded.length && !input.capacityConfirmed) {
      const error = new Error('선택한 담당자는 과부하 상태입니다. 경고를 확인한 뒤 다시 저장해주세요.');
      error.code = 'OVER_CAPACITY'; error.assessments = overloaded; throw error;
    }
  }
  if(data.status === 'done' && previous?.status !== 'done') data.completedAt = firebase.firestore.FieldValue.serverTimestamp();
  if(data.status !== 'done') data.completedAt = null;
  if(data.milestoneId) {
    const milestone = milestones.find(item => item.id === data.milestoneId);
    if(!milestone || milestone.projectId !== data.projectId) throw new Error('선택한 마일스톤은 연결 프로젝트에 속해야 합니다.');
  }
  if(data.dependsOn.includes(input.id)) throw new Error('업무는 자기 자신을 선행 업무로 지정할 수 없습니다.');
  if(data.dependsOn.some(dependencyId => wouldCreateDependencyCycle(input.id, dependencyId))) {
    throw new Error('순환 선행 관계가 생깁니다. 선행 업무를 다시 선택해주세요.');
  }
  let schedulePreview = { changes: [], retained: [], warnings: [] };
  let scheduleInputs = [];
  if(dependencyChanged || (isNew && data.dependsOn.length)) scheduleInputs = tasksForProject(data.projectId).map(task => ({id:task.id,signature:taskScheduleSignature(task)}));
  if((datesChanged || dependencyChanged || durationChanged) && window.DependencyScheduler) {
    const connected = tasksForProject(data.projectId);
    if(connected.some(task => window.DependencyScheduler.dependencies(task).length || task.deadlineRules?.length || task.scheduleSteps?.length)) {
      scheduleInputs = connected.map(task => ({id:task.id, signature:taskScheduleSignature(task)}));
      if(!workDataReadiness.holidays) throw new Error('공휴일 데이터를 불러오는 중입니다. 잠시 후 다시 저장해주세요.');
      const previewOptions = { holidays: holidays.map(item => item.date || item.id), conflictTasks: activeTasks(), rootPatch: data };
      schedulePreview = window.DependencyScheduler.previewChanges(connected, input.id, { startDate: data.startDate, dueDate: data.dueDate }, previewOptions);
      if(schedulePreview.changes.some(change => !canEditTask(tasks.find(task => task.id === change.id)))) throw new Error('다른 직군의 연결 일정도 변경됩니다. 관리자 또는 PM에게 일정 반영을 요청해주세요.');
      if(schedulePreview.changes.some(change=>change.kind==='step' && !canManageScheduleLinks(tasks.find(task=>task.id===change.id)))) throw new Error('내부 후속 작업 일정도 변경됩니다. 해당 직군 팀장 또는 PM에게 일정 반영을 요청해주세요.');
      if(schedulePreview.changes.length || schedulePreview.retained.length || schedulePreview.warnings.length || (recalculatedFromRule && schedulePreview.rootChange)) {
        if(!await confirmScheduleChanges(schedulePreview)) return false;
        assertCurrentSession(session);
        const freshPreview = window.DependencyScheduler.previewChanges(tasksForProject(data.projectId), input.id, { startDate: data.startDate, dueDate: data.dueDate }, { ...previewOptions, conflictTasks: activeTasks() });
        if(JSON.stringify(freshPreview) !== JSON.stringify(schedulePreview)) throw new Error('확인 중 연결 일정이 변경되었습니다. 다시 저장하여 변경 내용을 확인해주세요.');
      }
    }
  }
  schedulePreview.changes.filter(change=>change.id===input.id).forEach(change=>Object.assign(data,change.patch));
  const ref = isNew ? db.collection('tasks').doc() : db.collection('tasks').doc(input.id);
  if(1 + schedulePreview.changes.length + data.assignees.length > 500) throw new Error('한 번에 변경할 수 있는 업무 수를 초과했습니다.');
  const scheduleWrites = [];
  const batch = {
    set: (ref, value, options) => scheduleWrites.push({ type: 'set', ref, value, options }),
    update: (ref, value) => scheduleWrites.push({ type: 'update', ref, value })
  };
  schedulePreview.changes.forEach(change => batch.update(db.collection('tasks').doc(change.id), {
    ...change.patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  }));
  batch.set(ref, {
    ...data,
    id: firebase.firestore.FieldValue.delete(),
    createdBy: previous?.createdBy || currentUser.uid,
    createdAt: previous?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  // 프로젝트 구성원 문서가 있어야 팀원이 해당 프로젝트의 전체 흐름을 읽을 수 있습니다.
  if(data.projectId && (isNew || assignmentChanged || previous?.projectId!==data.projectId) && (isAdmin() || isPM() || isLead())) {
    data.assignees.forEach(assignee => batch.set(db.collection('projectMembers').doc(`${data.projectId}_${assignee.userId}`), {
      projectId: data.projectId, userId: assignee.userId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }));
    if((isAdmin()||isPM())&&projects.some(project=>project.id===data.projectId)){
      const parent=projects.find(project=>project.id===data.projectId);
      const departments=[...new Set([data.departmentId,...data.assigneeIds.map(id=>visibleUsers.find(user=>user.id===id)?.departmentId),...(parent.staffing||[]).filter(item=>item.userId).map(item=>item.departmentId),...(parent.projectAssignments||[]).filter(item=>item.assignmentType==='internal_user').map(item=>item.departmentId),...tasksForProject(data.projectId).filter(task=>task.departmentId!=='video_partner').map(task=>task.departmentId)].filter(Boolean))];
      batch.update(db.collection('projects').doc(data.projectId),{participantDepartmentIds:firebase.firestore.FieldValue.arrayUnion(...departments)});
    }
  }
  if(scheduleWrites.length>500)throw new Error('한 번에 변경할 수 있는 업무 수를 초과했습니다.');
  const applyWrites = writer => scheduleWrites.forEach(write => {
    if(write.type === 'update') writer.update(write.ref, write.value);
    else writer.set(write.ref, write.value, write.options);
  });
  if(!isNew || scheduleInputs.length) {
    await db.runTransaction(async transaction => {
      const ids = [...new Set([...(isNew ? [] : [input.id]),...scheduleInputs.map(task=>task.id)])];
      const docs = await Promise.all(ids.map(id => transaction.get(db.collection('tasks').doc(id))));
      assertCurrentSession(session);
      const server = new Map(ids.map((id,index)=>[id,docs[index]]));
      if(!isNew && (!server.get(input.id).exists || taskEditSignature(server.get(input.id).data())!==expectedSignature)) throw new Error('다른 담당자가 이 업무를 변경했습니다. 입력을 복사해 둔 뒤 창을 다시 열어 최신 내용을 확인해주세요.');
      const current = scheduleInputs.map(task=>server.get(task.id));
      current.forEach((doc, index) => {
        if(!doc.exists || taskScheduleSignature(doc.data()) !== scheduleInputs[index].signature) throw new Error('다른 담당자가 연결 일정을 변경했습니다. 다시 저장하여 변경 내용을 확인해주세요.');
      });
      if(dependencyChanged || (isNew && data.dependsOn.length)) {
        const graph = ids.filter(id=>server.get(id).exists).map(id=>({id,...server.get(id).data()}));
        if(data.dependsOn.some(id=>wouldCreateDependencyCycle(input.id,id,graph))) throw new Error('다른 변경으로 순환 선행 관계가 생깁니다. 연결을 다시 확인해주세요.');
      }
      applyWrites(transaction);
    });
  } else {
    const writer = db.batch(); applyWrites(writer); await writer.commit();
  }
  return true;
}

async function resolveTaskScheduleReview(taskId, applyRecommended, expectedTaskSignature){
  const task = tasks.find(item => item.id === taskId);
  if(!task?.scheduleReview || !canEditTask(task)) throw new Error('일정 확인 권한 또는 권장 일정이 없습니다.');
  if(applyRecommended) return saveTask({ ...task, expectedTaskSignature,
    startDate: task.scheduleReview.recommendedStartDate, dueDate: task.scheduleReview.recommendedDueDate,
    returnToAutomatic: true
  });
  await updateTaskWithGuard(task, { scheduleReview: null, dateOverride: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid }, expectedTaskSignature);
  return true;
}

async function restoreAutomaticSchedule(taskId, expectedTaskSignature){
  const task = tasks.find(item => item.id === taskId);
  if(!task || !canEditTask(task) || task.datePolicy === 'anchor' || !['after_task','before_task','during_task'].includes(task.scheduleRule?.type)) throw new Error('자동 일정으로 연결할 수 없는 업무입니다.');
  const predecessor = window.DependencyScheduler.dependencies(task).map(id => tasks.find(item => item.id === id && !item.archivedAt && item.projectId === task.projectId));
  if(!predecessor.length || predecessor.some(item => !item)) throw new Error('선행 업무를 찾을 수 없습니다.');
  if(!workDataReadiness.holidays) throw new Error('공휴일 데이터를 불러오는 중입니다.');
  const dates = window.DependencyScheduler.recommendDates(task, predecessor, holidays.map(item => item.date || item.id));
  if(!dates) throw new Error('선행 업무의 기준 날짜를 먼저 입력해주세요.');
  return saveTask({ ...task, ...dates, expectedTaskSignature, returnToAutomatic: true });
}

async function updateTaskWithGuard(task, patch, expectedSignature = taskEditSignature(task)){
  const session=authGeneration;
  const ref=db.collection('tasks').doc(task.id);
  await db.runTransaction(async transaction=>{
    const doc=await transaction.get(ref);
    assertCurrentSession(session);
    if(!doc.exists || taskEditSignature(doc.data())!==expectedSignature) throw new Error('다른 담당자가 이 업무를 변경했습니다. 최신 내용을 확인하고 다시 진행해주세요.');
    transaction.update(ref,patch);
  });
}
async function archiveTask(taskId, expectedSignature){
  const task = tasks.find(item => item.id === taskId);
  if(!requirePermission(canEditTask(task), '이 업무를 보관할 권한이 없습니다.')) return;
  await updateTaskWithGuard(task, {
    archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.uid
  }, expectedSignature);
}

async function completeTask(taskId){
  const task = tasks.find(item => item.id === taskId);
  if(!requirePermission(canEditTask(task), '이 업무를 완료 처리할 권한이 없습니다.')) return;
  await updateTaskWithGuard(task, {
    status: 'done', progress: 100,
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

function importedTaskStatus(value){
  const text = String(value || '').trim().toLowerCase();
  if(['완료', 'done', '100', '100%'].includes(text)) return 'done';
  if(['차단', '차단됨', 'blocked'].includes(text)) return 'blocked';
  if(['진행', '진행중', '진행 중', 'in progress', 'in_progress'].includes(text)) return 'in_progress';
  return 'todo';
}
function importedPlatform(value){
  const text = String(value || '').toLowerCase();
  if(text.includes('모바일') || text.includes('mobile')) return 'mobile';
  if(text.includes('콘솔') || text.includes('console') || text.includes('ps')) return 'console';
  return 'pc';
}
function importedDepartment(value){
  const text = String(value || '').toLowerCase();
  if(text.includes('ui')) return 'ui';
  if(text.includes('개발') || text.includes('program')) return 'development';
  if(text.includes('qa')) return 'qa';
  if(text.includes('영상')) return 'video';
  if(text.includes('글비') || text.includes('타코')) return 'business';
  if(text.includes('제작')) return 'studio';
  return 'planning';
}

function importTaskKey(row){
  const projectKey = String(row.projectCode || row.projectName || '').trim().toLowerCase();
  return [projectKey, String(row.title || '').trim().toLowerCase(), row.platform || 'pc', row.departmentId || 'planning', dateOnly(row.startDate), dateOnly(row.dueDate)].join('|');
}
function isDuplicateImportedRow(row){
  const key = importTaskKey(row);
  return activeTasks().some(task => {
    const project = projects.find(item => item.id === task.projectId);
    return importTaskKey({ ...task, projectCode: project?.code || project?.name || '' }) === key;
  });
}

async function importTasksFromPreview(rows,sourceName='',options={}){
  if(!requirePermission(canManageProjects(),'엑셀 이관은 PM 또는 관리자만 실행할 수 있습니다.'))return;
  if(!workDataReadiness.tasks||dataIssues.has('업무'))throw new Error('기존 업무를 불러온 뒤 이관해주세요. 연결 상태를 확인해주세요.');
  const session=authGeneration;
  if(!window.crypto?.subtle)throw new Error('안전한 이관을 지원하는 브라우저 환경에서 다시 시도해주세요.');
  const hash=async value=>Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
  const fingerprint=await hash(taskEditSignature({rows,sourceName}));
  assertCurrentSession(session);
  const storageKey=`milestone-import:${currentUser.uid}:${fingerprint}`;
  let operation;
  try{operation=JSON.parse(window.localStorage.getItem(storageKey)||'null');}catch(_){throw new Error('이관 재개 정보를 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요.');}
  const allRows=rows||[],validIndices=allRows.map((row,index)=>row.valid?index:-1).filter(index=>index>=0);
  if(operation&&(operation.version!==1||operation.uid!==currentUser.uid||operation.fingerprint!==fingerprint||!Array.isArray(operation.entries)||!operation.entries.every(entry=>Number.isInteger(entry.index)&&allRows[entry.index]?.valid&&typeof entry.taskId==='string'&&!entry.taskId.includes('/')&&typeof entry.projectId==='string'&&!entry.projectId.includes('/'))||!Number.isInteger(operation.completed)||operation.completed<0||operation.completed>operation.entries.length))throw new Error('이관 재개 정보가 올바르지 않습니다. 관리자에게 확인을 요청해주세요.');
  if(!operation){
    const knownProjects=new Map(projects.map(project=>[String(project.code||project.name).trim().toLowerCase(),project.id]));
    const projectsById=new Map(projects.map(project=>[project.id,project]));
    const keys=new Set(tasks.map(task=>importTaskKey({...task,projectCode:projectsById.get(task.projectId)?.code||projectsById.get(task.projectId)?.name||''})));
    const entries=[];
    for(const index of validIndices){
      const row=allRows[index],key=importTaskKey(row);if(keys.has(key))continue;keys.add(key);
      const projectKey=String(row.projectCode||row.projectName).trim().toLowerCase();
      if(!knownProjects.has(projectKey))knownProjects.set(projectKey,'import_project_'+await hash(projectKey));
      const assigned=activeUsers().find(user=>(user.name||'').trim()===String(row.assignee||'').trim()||(user.email||'').trim()===String(row.assignee||'').trim());
      const identity=await hash(key);
      entries.push({index,projectId:knownProjects.get(projectKey),projectWasExisting:projectsById.has(knownProjects.get(projectKey)),taskId:'import_'+identity,identity,userId:assigned?.id||null});
    }
    if(!entries.length)throw new Error('새로 이관할 업무가 없습니다. 이미 등록된 업무는 중복 생성하지 않습니다.');
    operation={version:1,uid:currentUser.uid,fingerprint,id:db.collection('tasks').doc().id,sourceName,completed:0,entries};
  }
  const persist=()=>{try{window.localStorage.setItem(storageKey,JSON.stringify(operation));}catch(_){throw new Error('이관 재개 정보를 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.');}};
  assertCurrentSession(session);
  persist();
  const plannedProjects=new Map();
  for(const entry of operation.entries){if(!plannedProjects.has(entry.projectId))plannedProjects.set(entry.projectId,{departments:new Set(),platforms:new Set()});const plan=plannedProjects.get(entry.projectId),row=allRows[entry.index];plan.departments.add(row.departmentId||'planning');plan.platforms.add(row.platform||'pc');}
  const total=operation.entries.length,notify=()=>options.onProgress?.({completed:operation.completed,total});notify();
  try{
    while(operation.completed<total){
      assertCurrentSession(session);
      const end=Math.min(total,operation.completed+100),chunk=operation.entries.slice(operation.completed,end);
      const refs=new Map();
      for(const entry of chunk){refs.set(`tasks/${entry.taskId}`,db.collection('tasks').doc(entry.taskId));refs.set(`projects/${entry.projectId}`,db.collection('projects').doc(entry.projectId));if(entry.userId)refs.set(`users/${entry.userId}`,db.collection('users').doc(entry.userId));}
      await db.runTransaction(async transaction=>{
        const list=[...refs],snapshots=await Promise.all(list.map(([,ref])=>transaction.get(ref))),server=new Map(list.map(([key],index)=>[key,snapshots[index]]));
        assertCurrentSession(session);const newProjects=new Set(),touchedProjects=new Set();
        for(const entry of chunk){
          const row=allRows[entry.index],taskDoc=server.get(`tasks/${entry.taskId}`),projectDoc=server.get(`projects/${entry.projectId}`),person=entry.userId?server.get(`users/${entry.userId}`):null;
          if(taskDoc.exists){if(taskDoc.data().importBatchId!==operation.id&&!(entry.identity&&taskDoc.data().importIdentity===entry.identity))throw new Error('이관 대상이 다른 업무와 충돌했습니다. 관리자에게 확인해주세요.');transaction.set(db.collection('projectMembers').doc(`${taskDoc.data().projectId}_${currentUser.uid}`),{projectId:taskDoc.data().projectId,userId:currentUser.uid},{merge:true});continue;}
          if(person&&(!person.exists||!person.data().active))throw new Error('배정할 구성원의 상태가 변경되었습니다. 관리자에게 확인해주세요.');
          if(projectDoc.exists&&projectDoc.data().status==='archived')throw new Error('이관할 프로젝트가 보관되었습니다. 프로젝트 상태를 확인해주세요.');
          if(!projectDoc.exists&&entry.projectWasExisting)throw new Error('기존 프로젝트가 삭제되었습니다. 이관을 중단하고 프로젝트를 확인해주세요.');
          if(projectDoc.exists&&!touchedProjects.has(entry.projectId)){touchedProjects.add(entry.projectId);transaction.set(refs.get(`projects/${entry.projectId}`),{participantDepartmentIds:firebase.firestore.FieldValue.arrayUnion(...plannedProjects.get(entry.projectId).departments)},{merge:true});transaction.set(db.collection('projectMembers').doc(`${entry.projectId}_${currentUser.uid}`),{projectId:entry.projectId,userId:currentUser.uid},{merge:true});}
          if(!projectDoc.exists&&!newProjects.has(entry.projectId)){
            newProjects.add(entry.projectId);const plan=plannedProjects.get(entry.projectId);transaction.set(refs.get(`projects/${entry.projectId}`),{code:row.projectCode||row.projectName,name:row.projectName||row.projectCode,platforms:[...plan.platforms],versions:[...plan.platforms],schedulingMode:'manual',status:'active',health:'on_track',managerIds:[currentUser.uid],observerIds:[],participantDepartmentIds:[...plan.departments],importBatchId:operation.id,createdBy:currentUser.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
            transaction.set(db.collection('projectMembers').doc(`${entry.projectId}_${currentUser.uid}`),{projectId:entry.projectId,userId:currentUser.uid},{merge:true});
          }
          const user=person?.data();
          transaction.set(refs.get(`tasks/${entry.taskId}`),normalizeTask({projectId:entry.projectId,platform:row.platform||'pc',departmentId:row.departmentId||'planning',taskGroup:row.taskGroup||'',title:row.title,system:row.system||'',buildVersion:row.buildVersion||'',assigneeId:entry.userId,assigneeName:user?(user.name||user.email):(row.assignee||'담당자 미배정'),legacyAssigneeName:user?null:(row.assignee||null),needsAssignment:!user,status:row.status||'todo',progress:row.status==='done'?100:0,estimatedDays:Math.max(0.5,Number(row.estimatedDays||1)),startDate:row.startDate||null,dueDate:row.dueDate||null,scheduleMode:'manual',importBatchId:operation.id,importIdentity:entry.identity||null,importSource:sourceName,importedAt:firebase.firestore.FieldValue.serverTimestamp(),archivedAt:null,createdBy:currentUser.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));
          if(entry.userId)transaction.set(db.collection('projectMembers').doc(`${entry.projectId}_${entry.userId}`),{projectId:entry.projectId,userId:entry.userId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        }
      });
      operation.completed=end;persist();notify();
    }
  }catch(cause){const error=new Error(`${operation.completed}/${total}개 업무의 완료를 확인했습니다. 같은 파일을 다시 선택하거나 이어서 실행해주세요. ${cause.message||''}`);error.importProgress={completed:operation.completed,total};throw error;}
  try{window.localStorage.removeItem(storageKey);}catch(_){/* A completed checkpoint is safe to retain. */}
  return {batchId:operation.id,imported:total,duplicatesSkipped:validIndices.length-total,excluded:allRows.length-validIndices.length};
}
async function reassignTask(taskId, assigneeId, force = false){
  const session=authGeneration;
  const task = tasks.find(item => item.id === taskId);
  if(!task) throw new Error('업무를 찾을 수 없습니다.');
  if(!requirePermission(canManageTaskAssignment(task), '담당자 변경은 본인 업무의 담당자, PM, 관리자 또는 해당 부서 팀장만 할 수 있습니다.')) return;
  if(!assigneeId) throw new Error('새 담당자를 선택해주세요.');
  const target = activeUsers().find(user => user.id === assigneeId) || (assigneeId === currentUser?.uid ? currentProfile : null);
  if(!target?.active) throw new Error('활성 상태의 담당자만 배정할 수 있습니다.');
  const assessment = assignmentAssessment(assigneeId, task);
  if(assessment.level === 'danger' && !force) {
    const error = new Error('대상자가 과부하 상태입니다. 경고를 확인한 뒤 다시 배정해주세요.');
    error.code = 'OVER_CAPACITY'; error.assessment = assessment; throw error;
  }
  const expectedSignature=taskEditSignature(task);
  const writes=[];
  const batch={update:(ref,data)=>writes.push({type:'update',ref,data}),set:(ref,data,options)=>writes.push({type:'set',ref,data,options})};
  batch.update(db.collection('tasks').doc(taskId), {
    ...primaryAssignmentFields(assigneeId, target.name || target.email || '이름 미지정'),
    previousAssigneeId: task.assigneeId || null, previousAssigneeName: task.assigneeId ? personName(task.assigneeId) : '담당자 미배정',
    assignmentWarning: assessment.level === 'danger' ? assessment.label : null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
  batch.set(db.collection('assignmentHistory').doc(), {
    taskId, projectId: task.projectId || null, previousAssigneeId: task.assigneeId || null, previousAssigneeName: task.assigneeId ? personName(task.assigneeId) : '담당자 미배정',
    nextAssigneeId: assigneeId, nextAssigneeName: target.name || target.email || '이름 미지정', warningLevel: assessment.level, warningMessage: assessment.level === 'danger' ? assessment.label : null,
    changedBy: currentUser.uid, changedByName: currentProfile.name || currentUser.displayName || currentUser.email || '', changedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  if(task.projectId && (isAdmin() || isPM() || isLead())) batch.set(db.collection('projectMembers').doc(`${task.projectId}_${assigneeId}`), {
    projectId: task.projectId, userId: assigneeId, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await db.runTransaction(async transaction=>{
    const doc=await transaction.get(db.collection('tasks').doc(taskId));
    assertCurrentSession(session);
    if(!doc.exists || taskEditSignature(doc.data())!==expectedSignature) throw new Error('다른 담당자가 이 업무를 변경했습니다. 최신 배정을 확인하고 다시 진행해주세요.');
    writes.forEach(write=>write.type==='update'?transaction.update(write.ref,write.data):transaction.set(write.ref,write.data,write.options));
  });
  return assessment;
}

async function saveProject(input){
  if(!requirePermission(canManageProjects(), '프로젝트는 관리자만 관리할 수 있습니다.')) return;
  if(!input.name?.trim()) throw new Error('프로젝트 이름을 입력해주세요.');
  const ref = input.id ? db.collection('projects').doc(input.id) : db.collection('projects').doc();
  await ref.set({
    name: input.name.trim(), code: (input.code || '').trim(),
    versions: input.versions || input.platforms || [], platforms: input.platforms || input.versions || [],
    staffing: Array.isArray(input.staffing) ? input.staffing : (input.staffing || []),
    schedulingMode: input.schedulingMode || 'manual', status: input.status || 'active',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid,
    createdAt: input.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: input.createdBy || currentUser.uid
  }, { merge: true });
}

async function completeProject(projectId){
  if(!requirePermission(canManageProjects(), '프로젝트 완료 처리는 관리자 또는 PM만 실행할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  await db.collection('projects').doc(projectId).update({
    status: 'completed', completedAt: firebase.firestore.FieldValue.serverTimestamp(), completedBy: currentUser.uid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

async function reopenProject(projectId){
  if(!requirePermission(canManageProjects(), '프로젝트 재개는 관리자 또는 PM만 실행할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  await db.collection('projects').doc(projectId).update({
    status: 'active', completedAt: null, completedBy: null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

async function createScheduledProject(input){
  if(!requirePermission(canManageProjects(), '프로젝트는 관리자 또는 PM만 생성할 수 있습니다.')) return;
  if(!input.name?.trim() || !input.code?.trim()) throw new Error('프로젝트명과 프로젝트 코드를 입력해주세요.');
  const platforms = [...new Set((input.platforms || []).filter(platform => PLATFORMS.some(item => item.id === platform)))];
  if(!platforms.length) throw new Error('적용할 플랫폼을 하나 이상 선택해주세요.');
  const milestoneDates = input.milestoneDates || {};
  if(!milestoneDates.demo_build || !milestoneDates.demo_release || !milestoneDates.full_build || !milestoneDates.full_release) {
    throw new Error('데모·완전판의 빌드 마감일과 출시일을 모두 입력해주세요.');
  }
  const projectRef = db.collection('projects').doc();
  const batch = db.batch();
  const staffing = (input.staffing || []).filter(item => platforms.includes(item.platform) && TEMPLATE_DEPARTMENTS.includes(item.departmentId));
  batch.set(projectRef, {
    name: input.name.trim(), code: input.code.trim(), platforms, versions: platforms, staffing,
    schedulingMode: 'template', status: 'active', health: 'on_track',
    createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const milestoneRefs = {};
  DELIVERY_MILESTONES.forEach(definition => {
    const ref = db.collection('milestones').doc();
    milestoneRefs[definition.key] = ref.id;
    batch.set(ref, {
      projectId: projectRef.id, title: definition.title, anchorKey: definition.key,
      version: null, dueDate: milestoneDates[definition.key], status: 'todo', generated: true, archivedAt: null,
      createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  const generatedTaskIds = new Map();
  platforms.forEach(platform => {
    PROJECT_WORK_TEMPLATE.forEach(template => { generatedTaskIds.set(templateTaskKey(platform, template.key), db.collection('tasks').doc().id); });
  });
  platforms.forEach(platform => {
    PROJECT_WORK_TEMPLATE.forEach(template => {
      const ref = db.collection('tasks').doc(generatedTaskIds.get(templateTaskKey(platform, template.key)));
      const staff = staffingFor({ staffing }, platform, template.departmentId);
      const dates = scheduledDates(milestoneDates[template.anchorKey], template.dueOffset, template.estimatedDays);
      const predecessorId = template.dependsOnKey ? generatedTaskIds.get(templateTaskKey(platform, template.dependsOnKey)) : null;
      batch.set(ref, normalizeTask({
        projectId: projectRef.id, platform, departmentId: template.departmentId,
        assigneeId: staff?.userId || null, assigneeName: staff?.userId ? personName(staff.userId) : null, title: template.title, milestoneId: milestoneRefs[template.anchorKey],
        phaseId: template.phaseId,
        status: 'todo', progress: 0, estimatedDays: template.estimatedDays,
        startDate: dates.startDate, dueDate: dates.dueDate, dependsOn: predecessorId ? [predecessorId] : [],
        generated: true, templateKey: template.key,
        scheduleRule: { anchorKey: template.anchorKey, dueOffset: template.dueOffset, estimatedDays: template.estimatedDays },
        archivedAt: null, createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
    });
  });
  staffing.filter(item => item.userId).forEach(item => {
    batch.set(db.collection('projectMembers').doc(`${projectRef.id}_${item.userId}`), {
      projectId: projectRef.id, userId: item.userId, platforms: firebase.firestore.FieldValue.arrayUnion(item.platform),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
  return projectRef.id;
}

function projectAccessFields(project, input={}){
  const managerIds=[...new Set(input.managerIds ?? project.managerIds ?? (project.createdBy ? [project.createdBy] : [currentUser.uid]))];
  const observerIds=[...new Set(input.observerIds ?? project.observerIds ?? [])];
  for(const id of [...managerIds,...observerIds]){
    const previous=(project.managerIds||[]).includes(id)||(project.observerIds||[]).includes(id)||project.createdBy===id;
    const user=visibleUsers.find(user=>user.id===id)||(id===currentUser.uid?currentProfile:null);
    if(!previous && !user?.active)throw new Error('활성 구성원을 프로젝트 참여자로 선택해주세요.');
    const previousManager=(project.managerIds||[]).includes(id)||(!Array.isArray(project.managerIds)&&project.createdBy===id);
    if(managerIds.includes(id)&&!previousManager&&!(user?.active&&(user?.isAdmin||['admin','pm'].includes(user?.role))))throw new Error('관리 담당자는 PM 또는 관리자여야 합니다.');
  }
  const actualDepartments=tasks.filter(task=>task.projectId===project.id&&!task.archivedAt&&task.departmentId!=='video_partner').flatMap(task=>[task.departmentId,...(task.assigneeIds||[]).map(id=>visibleUsers.find(user=>user.id===id)?.departmentId)]);
  const participantDepartmentIds=[...new Set([...(project.projectAssignments||[]).filter(item=>item.assignmentType==='internal_user'&&item.assigneeId).map(item=>item.departmentId),...(project.staffing||[]).filter(item=>item.userId).map(item=>item.departmentId),...observerIds.map(id=>visibleUsers.find(user=>user.id===id)?.departmentId),...actualDepartments].filter(Boolean))];
  return {managerIds,observerIds,participantDepartmentIds};
}
function queueProjectAccess(batch, projectId, previous, next, audit={}){
  const required=new Set([...next.managerIds,...next.observerIds,...(next.projectAssignments||[]).map(item=>item.assigneeId),...(next.staffing||[]).map(item=>item.userId)].filter(Boolean));
  [...next.managerIds,...next.observerIds].forEach(userId=>batch.set(db.collection('projectMembers').doc(`${projectId}_${userId}`),{projectId,userId,...audit},{merge:true}));
  [...new Set([...(previous.managerIds||[]),...(previous.observerIds||[])])].filter(id=>!required.has(id)&&!tasks.some(task=>task.projectId===projectId&&(task.assigneeId===id||(task.assigneeIds||[]).includes(id)))).forEach(id=>batch.delete(db.collection('projectMembers').doc(`${projectId}_${id}`)));
}
function guardedProjectBatch(project, expectedSignature=taskEditSignature(project)){
  const session=authGeneration;
  const writes=[],originalTasks=new Map(tasks.map(task=>[task.id,taskEditSignature(task)]));
  return {
    set:(ref,data,options)=>writes.push({type:'set',ref,data,options}),update:(ref,data)=>writes.push({type:'update',ref,data}),delete:ref=>writes.push({type:'delete',ref}),
    commit:async()=>{
      assertCurrentSession(session);
      if(writes.length>500)throw new Error('한 번에 변경할 수 있는 업무 수를 초과했습니다.');
      await db.runTransaction(async transaction=>{
        const original=await transaction.get(db.collection('projects').doc(project.id));
        if(!original.exists||taskEditSignature(original.data())!==expectedSignature)throw new Error('다른 관리자가 프로젝트를 변경했습니다. 입력을 남겨두고 최신 설정을 다시 확인해주세요.');
        const refs=[...new Map(writes.filter(write=>write.ref.path?.startsWith('tasks/')||write.ref.collection==='tasks'||write.ref.collectionName==='tasks').filter(write=>originalTasks.has(write.ref.id)).map(write=>[write.ref.id,write.ref])).values()];
        const docs=await Promise.all(refs.map(ref=>transaction.get(ref)));
        assertCurrentSession(session);
        docs.forEach((doc,index)=>{if(!doc.exists||taskEditSignature(doc.data())!==originalTasks.get(refs[index].id))throw new Error('담당 정보를 확인하는 동안 업무가 변경되었습니다. 이관 대상을 다시 확인해주세요.');});
        writes.forEach(write=>{if(write.type==='delete')transaction.delete(write.ref);else if(write.type==='update')transaction.update(write.ref,write.data);else transaction.set(write.ref,write.data,write.options);});
      });
    }
  };
}

function guardedEntityBatch(overrides=[]){
  const session=authGeneration,writes=[],guards=new Map();
  const sources={tasks,projects,milestones,users:visibleUsers};
  const keyOf=ref=>ref.path||`${ref.collectionName||(typeof ref.collection==='string'?ref.collection:'')}/${ref.id}`;
  const expect=(collection,id,signature)=>guards.set(`${collection}/${id}`,{ref:db.collection(collection).doc(id),signature});
  overrides.forEach(item=>expect(item.collection,item.id,item.signature));
  const queue=(type,ref,data,options)=>{
    const key=keyOf(ref),[collection,id]=key.split('/'),original=sources[collection]?.find(item=>item.id===id);
    if(original&&!guards.has(key))expect(collection,id,taskEditSignature(original));
    writes.push({type,ref,data,options});
  };
  return {set:(ref,data,options)=>queue('set',ref,data,options),update:(ref,data)=>queue('update',ref,data),expect,
    commit:async()=>{
      assertCurrentSession(session);
      if(writes.length>500)throw new Error('한 번에 처리할 수 있는 업무 수를 초과했습니다. 범위를 나누어 처리해주세요.');
      await db.runTransaction(async transaction=>{
        const list=[...guards.values()],docs=await Promise.all(list.map(item=>transaction.get(item.ref)));
        assertCurrentSession(session);
        docs.forEach((doc,index)=>{if(!doc.exists||taskEditSignature(doc.data())!==list[index].signature)throw new Error('다른 사용자가 내용을 변경했습니다. 입력을 남겨두고 최신 내용을 다시 확인해주세요.');});
        writes.forEach(write=>write.type==='update'?transaction.update(write.ref,write.data):transaction.set(write.ref,write.data,write.options));
      });
    }
  };
}
async function createProjectFromTemplate(input){
  const session=authGeneration;
  if(!requirePermission(canManageProjects(), '프로젝트는 관리자 또는 PM만 생성할 수 있습니다.')) return;
  const catalog = await loadProjectTemplateCatalog();
  assertCurrentSession(session);
  (input.assignments || []).filter(item => catalog.roles.find(role => role.id === item.roleId)?.assignmentType === 'internal_user').forEach(item => {
    if(!visibleUsers.some(user => user.id === item.userId && user.active && user.departmentId === item.roleId)) throw new Error(`${departmentName(item.roleId)}의 활성 담당자를 선택해주세요.`);
  });
  const access=projectAccessFields({},input);
  const snapshot = window.ProjectTemplateEngine.buildProjectSnapshot(catalog, {...input,managerIds:access.managerIds,observerIds:access.observerIds}, {
    idFactory: prefix => db.collection(prefix === 'task' ? 'tasks' : 'projects').doc().id
  });
  snapshot.project.participantDepartmentIds=projectAccessFields(snapshot.project,input).participantDepartmentIds;
  const writes = window.ProjectTemplateEngine.createProjectWritePlan(snapshot);
  if(writes.length > 500) throw new Error('한 번에 생성할 수 있는 업무 수를 초과했습니다. 템플릿을 나누어주세요.');
  const batch = db.batch();
  writes.forEach(write => {
    const data = {
      ...write.data,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const normalized = write.collection === 'tasks' ? normalizeTask({ ...data, assigneeName: data.assigneeId ? personName(data.assigneeId) : null }) : data;
    const ref = db.collection(write.collection).doc(write.id);
    if(write.merge) batch.set(ref, normalized, { merge: true });
    else batch.set(ref, normalized);
  });
  await batch.commit();
  return snapshot.project.id;
}

async function rescheduleGeneratedTasks(projectId, milestoneOverrides = {}){
  if(!requirePermission(canManageProjects(), '일정 재계산은 관리자 또는 PM만 실행할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  const anchors = projectMilestoneMap(projectId, milestoneOverrides);
  const generated = tasksForProject(projectId).filter(task => task.generated && task.scheduleRule?.anchorKey && anchors[task.scheduleRule.anchorKey] && !task.dateOverride && !task.dateLocked && task.status !== 'done'&&task.scheduleMode!=='manual'&&task.datePolicy!=='anchor');
  const batch = guardedEntityBatch([{collection:'projects',id:projectId,signature:taskEditSignature(project)}]);
  generated.forEach(task => {
    const rule = task.scheduleRule;
    const dates = scheduledDates(anchors[rule.anchorKey], rule.dueOffset, rule.estimatedDays || task.estimatedDays);
    batch.update(db.collection('tasks').doc(task.id), { startDate: dates.startDate, dueDate: dates.dueDate, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  });
  if(generated.length) await batch.commit();
}

async function syncProjectStaffing(projectId, staffing, options = {}){
  if(projects.find(item => item.id === projectId)?.schedulingMode === 'template_v2') throw new Error('새 템플릿 프로젝트는 전용 담당자 수정 기능을 사용해주세요.');
  if(!requirePermission(canManageProjects(), '담당자 배정은 관리자 또는 PM만 변경할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  const cleaned = (staffing || []).filter(item => (project.platforms || []).includes(item.platform) && TEMPLATE_DEPARTMENTS.includes(item.departmentId))
    .map(item => ({ platform: item.platform, departmentId: item.departmentId, userId: item.userId || null }));
  cleaned.forEach(item => {
    const previous = staffingFor(project,item.platform,item.departmentId)?.userId || null;
    if(item.userId && item.userId !== previous && !visibleUsers.some(user=>user.id===item.userId && user.active && user.departmentId===item.departmentId)) throw new Error(`${departmentName(item.departmentId)}의 활성 담당자를 선택해주세요.`);
  });
  let writeCount = 1;
  const access=projectAccessFields({...project,staffing:cleaned,projectAssignments:[]},options);
  const batch = guardedProjectBatch(project,options.expectedProjectSignature);
  const info = options.info || {};
  if(options.info && (!info.name?.trim() || !info.code?.trim())) throw new Error('프로젝트명과 코드를 입력해주세요.');
  batch.update(db.collection('projects').doc(projectId), { ...(options.info ? {name:info.name.trim(),code:info.code.trim()} : {}), staffing: cleaned,...access, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  // 기존 자동 일정 프로젝트에 템플릿 업무가 빠져 있으면 담당자를 저장할 때만 보완합니다.
  // 날짜가 없는 수동 프로젝트에는 임의의 데모·완전판 일정을 만들지 않습니다.
  const anchors = projectMilestoneMap(projectId);
  const milestoneIds = new Map(milestonesForProject(projectId).filter(item => item.anchorKey).map(item => [item.anchorKey, item.id]));
  const hasAllAnchors = DELIVERY_MILESTONES.every(definition => anchors[definition.key] && milestoneIds.has(definition.key));
  if(project.schedulingMode === 'template' && hasAllAnchors) {
    const existingGenerated = new Map(tasksForProject(projectId).filter(task => task.generated && task.templateKey).map(task => [templateTaskKey(task.platform, task.templateKey), task]));
    const generatedIds = new Map();
    (project.platforms || []).forEach(platform => PROJECT_WORK_TEMPLATE.forEach(template => {
      const key = templateTaskKey(platform, template.key);
      generatedIds.set(key, existingGenerated.get(key)?.id || db.collection('tasks').doc().id);
    }));
    (project.platforms || []).forEach(platform => PROJECT_WORK_TEMPLATE.forEach(template => {
      const key = templateTaskKey(platform, template.key);
      if(existingGenerated.has(key)) return;
      writeCount++;
      const staff = staffingFor({ staffing: cleaned }, platform, template.departmentId);
      const dates = scheduledDates(anchors[template.anchorKey], template.dueOffset, template.estimatedDays);
      const predecessorId = template.dependsOnKey ? generatedIds.get(templateTaskKey(platform, template.dependsOnKey)) : null;
      batch.set(db.collection('tasks').doc(generatedIds.get(key)), normalizeTask({
        projectId, platform, departmentId: template.departmentId, phaseId: template.phaseId, title: template.title,
        assigneeId: staff?.userId || null, assigneeName: staff?.userId ? personName(staff.userId) : null,
        milestoneId: milestoneIds.get(template.anchorKey), status: 'todo', progress: 0, estimatedDays: template.estimatedDays,
        startDate: dates.startDate, dueDate: dates.dueDate, dependsOn: predecessorId ? [predecessorId] : [],
        generated: true, templateKey: template.key,
        scheduleRule: { anchorKey: template.anchorKey, dueOffset: template.dueOffset, estimatedDays: template.estimatedDays },
        archivedAt: null, createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.uid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
    }));
  }
  selectedProjectAssignmentChanges(project, cleaned, options.ongoingTaskIds).forEach(task => {
    const staff = staffingFor({ staffing: cleaned }, task.platform, task.departmentId);
    if(!staff) return;
    writeCount++;
    const assignment = transferredTaskAssignment(task, staff.userId);
    batch.update(db.collection('tasks').doc(task.id), { assigneeId: assignment.assigneeId, assigneeIds: assignment.assigneeIds, assignees: assignment.assignees, assigneeName: assignment.assigneeId ? personName(assignment.assigneeId) : '담당자 미배정', updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  });
  cleaned.filter(item => item.userId).forEach(item => {
    writeCount++;
    batch.set(db.collection('projectMembers').doc(`${projectId}_${item.userId}`), {
      projectId, userId: item.userId, platforms: firebase.firestore.FieldValue.arrayUnion(item.platform), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  queueProjectAccess(batch,projectId,project,{...project,staffing:cleaned,...access},{updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
  if(writeCount > 500) throw new Error('한 번에 변경할 수 있는 업무 수를 초과했습니다.');
  await batch.commit();
}

function previewProjectAssignmentChanges(project, assignments){
  return tasksForProject(project.id).filter(task => {
    if(!task.generated || task.status === 'done' || task.sourceType === 'manual' || task.parentTaskId) return false;
    const modern = project.schedulingMode === 'template_v2';
    if(!modern && task.departmentId === 'video_partner') return false;
    const previous = modern ? project.projectAssignments?.find(item => item.departmentId === task.departmentId) : staffingFor(project, task.platform, task.departmentId);
    const next = modern ? assignments.find(item => item.departmentId === task.departmentId) : staffingFor({staffing:assignments}, task.platform, task.departmentId);
    if(!previous || !next) return false;
    if(previous.assignmentType === 'external_text') return task.externalAssigneeName === previous.externalAssigneeName && previous.externalAssigneeName !== next.externalAssigneeName;
    const oldId = (modern ? previous.assigneeId : previous.userId) || null;
    const nextId = (modern ? next.assigneeId : next.userId) || null;
    return (task.assigneeId || null) === oldId && oldId !== nextId;
  });
}

function projectAssignmentNeedsChoice(task){
  return task.status === 'in_progress' || Number(task.progress || 0) > 0;
}

function selectedProjectAssignmentChanges(project, assignments, ongoingTaskIds = []){
  const chosen = new Set(ongoingTaskIds || []);
  return previewProjectAssignmentChanges(project, assignments).filter(task => !projectAssignmentNeedsChoice(task) || chosen.has(task.id));
}

// Transfer the former primary's share, not a fresh share=1. Merge if the new
// primary already supports this task; clearing a primary never promotes support.
function transferredTaskAssignment(task, nextId){
  const original = normalizeTask(task).assignees;
  const previous = original.find(item => item.userId === task.assigneeId);
  const existing = original.find(item => item.userId === nextId && item.userId !== task.assigneeId);
  const supporters = original.filter(item => item.userId !== task.assigneeId && item.userId !== nextId).map(item => ({...item,role:'co'}));
  const assignees = nextId ? [{userId:nextId,role:'primary',share:(previous?.share ?? (original.length ? 0 : 1)) + (existing?.share || 0)},...supporters] : supporters;
  return {assigneeId:nextId || null,assigneeIds:assignees.map(item=>item.userId),assignees};
}

async function saveTemplateProject(projectId, input){
  if(!requirePermission(canManageProjects(), '프로젝트는 관리자 또는 PM만 수정할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project || project.schedulingMode !== 'template_v2') throw new Error('새 템플릿 프로젝트를 찾을 수 없습니다.');
  if(!input.name?.trim() || !input.code?.trim()) throw new Error('프로젝트명과 코드를 입력해주세요.');
  const assignments = (project.projectAssignments || []).map(previous => {
    const next = input.assignments.find(item => item.departmentId === previous.departmentId);
    if(!next) throw new Error('담당 정보가 누락되었습니다.');
    if(previous.assignmentType === 'internal_user') {
      const person = visibleUsers.find(user => user.id === next.assigneeId && user.active && user.departmentId === previous.departmentId);
      if(!person) throw new Error(`${departmentName(previous.departmentId)}의 활성 담당자를 선택해주세요.`);
      return { ...previous, assigneeId: person.id };
    }
    if(!next.externalAssigneeName?.trim()) throw new Error('영상 파트너명을 입력해주세요.');
    return { ...previous, externalAssigneeName: next.externalAssigneeName.trim() };
  });
  const changes = selectedProjectAssignmentChanges(project, assignments, input.ongoingTaskIds);
  const access=projectAccessFields({...project,projectAssignments:assignments,staffing:[]},input);
  const batch = guardedProjectBatch(project,input.expectedProjectSignature);
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();
  const audit = { updatedAt: timestamp, updatedBy: currentUser.uid };
  batch.update(db.collection('projects').doc(projectId), {
    name: input.name.trim(), code: input.code.trim(), projectAssignments: assignments,...access,
    staffing: (project.platforms || []).flatMap(platform => assignments.filter(item => item.assignmentType === 'internal_user').map(item => ({ platform, departmentId: item.departmentId, userId: item.assigneeId }))), ...audit
  });
  changes.forEach(task => {
    const next = assignments.find(item => item.departmentId === task.departmentId);
    if(next.assignmentType === 'external_text') {
      batch.update(db.collection('tasks').doc(task.id), { externalAssigneeName: next.externalAssigneeName, ...audit });
      return;
    }
    const normalized = transferredTaskAssignment(task, next.assigneeId);
    batch.update(db.collection('tasks').doc(task.id), {
      assigneeId: normalized.assigneeId, assigneeIds: normalized.assigneeIds, assignees: normalized.assignees,
      assigneeName: personName(next.assigneeId), ...audit
    });
  });
  const members = [...new Set(assignments.filter(item => item.assignmentType === 'internal_user').map(item => item.assigneeId))];
  members.forEach(userId => batch.set(db.collection('projectMembers').doc(`${projectId}_${userId}`), { projectId, userId, platforms: project.platforms, ...audit }, { merge: true }));
  queueProjectAccess(batch,projectId,project,{...project,projectAssignments:assignments,...access},audit);
  if(1 + changes.length + members.length + access.managerIds.length + access.observerIds.length + (project.managerIds||[]).length+(project.observerIds||[]).length > 500) throw new Error('한 번에 변경할 수 있는 업무 수를 초과했습니다.');
  await batch.commit();
}

async function saveProjectUpdate(input){
  if(!requirePermission(isAdmin() || isPM() || isLead(), '프로젝트 업데이트는 PM, 팀장 또는 관리자만 작성할 수 있습니다.')) return;
  if(!input.projectId) throw new Error('프로젝트를 선택해주세요.');
  const project = projects.find(item => item.id === input.projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  const health = ['on_track', 'at_risk', 'off_track'].includes(input.health) ? input.health : 'on_track';
  const batch = db.batch();
  batch.set(db.collection('projectUpdates').doc(), {
    projectId: input.projectId, health,
    achievements: (input.achievements || '').trim(), blockers: (input.blockers || '').trim(), nextSteps: (input.nextSteps || '').trim(),
    createdBy: currentUser.uid, createdByName: currentProfile.name || currentUser.displayName || currentUser.email || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  batch.update(db.collection('projects').doc(project.id), {
    health, lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
  await batch.commit();
}

function watchTaskDiscussion(taskId, onChange){
  const session=authGeneration;
  let active=true;
  let comments = [], links = [];
  const publish = () => {if(active&&session===authGeneration)onChange({ comments, links });};
  const unsubComments = db.collection('tasks').doc(taskId).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snapshot => {
    comments = snapshot.docs.map(docToObject); publish();
  }, error => console.error('댓글 구독 실패:', error));
  const unsubLinks = db.collection('tasks').doc(taskId).collection('links').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    links = snapshot.docs.map(docToObject); publish();
  }, error => console.error('링크 구독 실패:', error));
  return () => { active=false;unsubComments(); unsubLinks(); };
}

async function addTaskComment(taskId, text){
  if(!isApproved() || !text?.trim()) throw new Error('댓글 내용을 입력해주세요.');
  const task = tasks.find(item => item.id === taskId);
  if(!task) throw new Error('업무를 찾을 수 없습니다.');
  await db.collection('tasks').doc(taskId).collection('comments').add({
    text: text.trim(), authorId: currentUser.uid,
    authorName: currentProfile.name || currentUser.displayName || currentUser.email || '이름 미지정',
    mentions: (text.match(/@[^\s@]+/g) || []).map(name => name.slice(1)),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function addTaskLink(taskId, input){
  if(!isApproved()) return;
  const task = tasks.find(item => item.id === taskId);
  if(!task || !canEditTask(task)) throw new Error('링크를 추가할 권한이 없습니다.');
  let url;
  try { url = new URL(input.url.trim()); }
  catch { throw new Error('올바른 링크 주소를 입력해주세요.'); }
  if(!['https:', 'http:'].includes(url.protocol)) throw new Error('http 또는 https 링크만 추가할 수 있습니다.');
  await db.collection('tasks').doc(taskId).collection('links').add({
    url: url.href, label: (input.label || '').trim() || url.hostname,
    addedBy: currentUser.uid, addedByName: currentProfile.name || currentUser.displayName || currentUser.email || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function saveMilestone(input){
  if(!requirePermission(canManageProjects(), '주요 일정은 관리자 또는 PM만 관리할 수 있습니다.'))return;
  if(!input.projectId||!input.title?.trim())throw new Error('프로젝트와 일정 제목을 입력해주세요.');
  const project=projects.find(item=>item.id===input.projectId);
  if(!project||project.status==='archived')throw new Error('사용 가능한 프로젝트를 선택해주세요.');
  const original=milestones.find(item=>item.id===input.id);
  if(original&&original.projectId!==input.projectId)throw new Error('일정의 프로젝트를 변경할 수 없습니다. 새 프로젝트에 일정을 추가해주세요.');
  if(input.id&&!original)throw new Error('일정이 삭제되었거나 조회할 수 없습니다.');
  const expected=input.expectedSignature||(original?taskEditSignature(original):null);
  if(original&&taskEditSignature(original)!==expected)throw new Error('일정이 변경되었습니다. 최신 내용을 확인해주세요.');
  const ref=db.collection('milestones').doc(input.id||undefined),batch=guardedEntityBatch(original?[{collection:'milestones',id:original.id,signature:expected}]:[]);
  batch.expect('projects',project.id,taskEditSignature(project));
  batch.set(ref,{projectId:input.projectId,title:input.title.trim(),version:input.version||null,anchorKey:original?.anchorKey||input.anchorKey||null,dueDate:input.dueDate||null,status:input.status||'todo',archivedAt:original?.archivedAt||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid,createdAt:original?.createdAt||firebase.firestore.FieldValue.serverTimestamp(),createdBy:original?.createdBy||currentUser.uid},{merge:true});
  const anchor=original?.anchorKey||input.anchorKey;
  if(anchor&&input.dueDate&&dateOnly(original?.dueDate)!==input.dueDate){
    if(!workDataReadiness.holidays)throw new Error('공휴일 정보를 불러온 뒤 기준 일정을 저장해주세요.');
    tasksForProject(input.projectId).filter(task=>task.generated&&task.scheduleRule?.anchorKey===anchor&&!task.dateOverride&&!task.dateLocked&&task.status!=='done'&&!task.archivedAt&&task.scheduleMode!=='manual').forEach(task=>{
      const dates=scheduledDates(input.dueDate,task.scheduleRule.dueOffset,task.scheduleRule.estimatedDays||task.estimatedDays);
      batch.update(db.collection('tasks').doc(task.id),{...dates,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
    });
  }
  await batch.commit();return ref.id;
}

async function setMilestoneArchived(milestoneId,archived,expectedSignature){
  if(!requirePermission(canManageProjects(),'주요 일정은 관리자 또는 PM만 관리할 수 있습니다.'))return;
  const item=milestones.find(value=>value.id===milestoneId),project=projects.find(value=>value.id===item?.projectId);
  if(!item||Boolean(item.archivedAt)===archived)throw new Error('일정 상태가 변경되었습니다. 최신 목록을 확인해주세요.');
  if(!project||project.status==='archived')throw new Error('프로젝트를 먼저 복구해주세요.');
  const batch=guardedEntityBatch([{collection:'milestones',id:item.id,signature:expectedSignature||taskEditSignature(item)}]);
  batch.expect('projects',project.id,taskEditSignature(project));
  batch.update(db.collection('milestones').doc(item.id),{archivedAt:archived?firebase.firestore.FieldValue.serverTimestamp():null,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
  await batch.commit();
}
async function archiveMilestone(id,signature){return setMilestoneArchived(id,true,signature);}
async function restoreMilestone(id,signature){return setMilestoneArchived(id,false,signature);}
async function approveAccessRequest(requestId, role, departmentId, adminAccess = false){
  if(!requirePermission(isAdmin(), '사용자 권한은 관리자만 부여할 수 있습니다.')) return;
  const request = accessRequests.find(item => item.id === requestId);
  if(!request) throw new Error('승인 요청을 찾을 수 없습니다.');
  if(!['pm', 'lead', 'member'].includes(role)) throw new Error('올바른 업무 역할을 선택해주세요.');
  if(role !== 'pm' && !departmentId) throw new Error('소속 부서를 선택해주세요.');
  const batch = db.batch();
  batch.set(db.collection('users').doc(requestId), {
    email: request.email || '', name: request.name || request.email || '이름 미지정',
    role, departmentId: role === 'pm' ? null : departmentId, isAdmin: Boolean(adminAccess), active: true,
    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  }, { merge: true });
  batch.delete(db.collection('accessRequests').doc(requestId));
  await batch.commit();
}

async function saveUserRole(userId, role, departmentId, adminAccess = false){
  if(!requirePermission(isAdmin(), '사용자 권한은 관리자만 변경할 수 있습니다.')) return;
  if(!['pm', 'lead', 'member'].includes(role)) throw new Error('올바른 업무 역할을 선택해주세요.');
  if(role !== 'pm' && !departmentId) throw new Error('소속 부서를 선택해주세요.');
  if(userId === currentUser.uid && isAdmin() && !adminAccess) throw new Error('본인의 관리자 권한은 해제할 수 없습니다. 다른 관리자에게 요청해주세요.');
  await db.collection('users').doc(userId).update({
    role, departmentId: role === 'pm' ? null : departmentId, isAdmin: Boolean(adminAccess),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

function unfinishedTasksForUser(userId){ return activeTasks().filter(task => (task.assigneeId===userId||(task.assigneeIds||[]).includes(userId)||(task.assignees||[]).some(item=>item.userId===userId)) && task.status !== 'done'); }

async function offboardUser(userId,decisions,expectedUserSignature){
  const user=visibleUsers.find(item=>item.id===userId);
  if(!requirePermission(canManageOffboarding(user),'퇴사 처리는 관리자 또는 해당 부서 팀장만 할 수 있습니다.'))return;
  if(userId===currentUser?.uid)throw new Error('본인 계정은 직접 퇴사 처리할 수 없습니다.');
  if(!user?.active)throw new Error('이미 비활성화된 사용자입니다.');
  const unresolved=unfinishedTasksForUser(userId),byTask=new Map((decisions||[]).map(item=>[item.taskId,item]));
  if(unresolved.some(task=>!byTask.has(task.id)))throw new Error('처리할 업무가 변경되었습니다. 창을 다시 열어 모든 업무를 확인해주세요.');
  const batch=guardedEntityBatch([{collection:'users',id:userId,signature:expectedUserSignature||taskEditSignature(user)}]);
  for(const task of unresolved){
    const decision=byTask.get(task.id),primary=task.assigneeId===userId;
    if(!canEditTask(task))throw new Error('다른 직군의 공동 업무가 포함되어 있습니다. PM 또는 관리자에게 처리를 요청해주세요.');
    if(decision.expectedSignature&&decision.expectedSignature!==taskEditSignature(task))throw new Error('업무가 변경되었습니다. 최신 처리 대상을 다시 확인해주세요.');
    if(!['reassign','unassign','archive'].includes(decision.action)||(!primary&&decision.action==='archive'))throw new Error('공동 담당 업무는 참여자를 변경하거나 참여를 해제해주세요.');
    let patch={};
    if(decision.action==='archive')patch={archivedAt:firebase.firestore.FieldValue.serverTimestamp(),offboardingAction:'archived'};
    else{
      let next=null;
      if(decision.action==='reassign'){
        next=activeUsers().find(item=>item.id===decision.userId&&item.id!==userId);
        if(!next||(!canManageProjects()&&next.departmentId!==user.departmentId))throw new Error('배정 가능한 활성 담당자를 선택해주세요.');
        batch.expect('users',next.id,taskEditSignature(next));
      }
      if(primary){patch={...transferredTaskAssignment(task,next?.id),assigneeName:next?next.name||next.email:'담당자 미배정',needsAssignment:!next};}
      else{
        const original=normalizeTask(task).assignees,departing=original.find(item=>item.userId===userId);
        const remaining=original.filter(item=>item.userId!==userId).map(item=>({...item}));
        if(next){const existing=remaining.find(item=>item.userId===next.id);if(existing)existing.share+=departing?.share||0;else remaining.push({userId:next.id,role:'co',share:departing?.share||0});}
        const normalized=normalizeTask({...task,assignees:remaining});patch={assigneeId:task.assigneeId,assigneeIds:normalized.assigneeIds,assignees:normalized.assignees};
      }
      if(Object.hasOwn(task,'supporterIds'))patch.supporterIds=(patch.assigneeIds||[]).filter(id=>id!==patch.assigneeId);
      if(next&&task.projectId)batch.set(db.collection('projectMembers').doc(`${task.projectId}_${next.id}`),{projectId:task.projectId,userId:next.id,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    batch.update(db.collection('tasks').doc(task.id),{...patch,previousAssigneeId:userId,previousAssigneeName:user.name||user.email||'',handoverAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
    batch.set(db.collection('assignmentHistory').doc(),{taskId:task.id,projectId:task.projectId||null,previousAssigneeId:userId,previousAssigneeName:user.name||user.email||'',nextAssigneeId:decision.action==='reassign'?decision.userId:null,nextAssigneeName:decision.action==='reassign'?personName(decision.userId):'미배정',action:decision.action,assignmentRole:primary?'primary':'co',changedBy:currentUser.uid,changedByName:personName(currentUser.uid),changedAt:firebase.firestore.FieldValue.serverTimestamp()});
  }
  const projectDefaultsNeedReview=[];
  for(const project of projects){
    const staffing=(project.staffing||[]).map(item=>item.userId===userId?{...item,userId:null}:item);
    const assignments=(project.projectAssignments||[]).map(item=>item.assigneeId===userId?{...item,assigneeId:null,assigneeName:null}:item);
    const managerIds=(project.managerIds||[]).filter(id=>id!==userId),observerIds=(project.observerIds||[]).filter(id=>id!==userId);
    const patch={};
    if(JSON.stringify(staffing)!==JSON.stringify(project.staffing||[]))patch.staffing=staffing;
    const metadataChanged=JSON.stringify(assignments)!==JSON.stringify(project.projectAssignments||[])||managerIds.length!==(project.managerIds||[]).length||observerIds.length!==(project.observerIds||[]).length;
    if(metadataChanged&&canManageProjects()){if(JSON.stringify(assignments)!==JSON.stringify(project.projectAssignments||[]))patch.projectAssignments=assignments;if(managerIds.length!==(project.managerIds||[]).length)patch.managerIds=managerIds;if(observerIds.length!==(project.observerIds||[]).length)patch.observerIds=observerIds;}
    else if(metadataChanged)projectDefaultsNeedReview.push(project.id);
    if(Object.keys(patch).length)batch.update(db.collection('projects').doc(project.id),{...patch,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
  }
  batch.update(db.collection('users').doc(userId),{active:false,offboardedAt:firebase.firestore.FieldValue.serverTimestamp(),offboardedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentUser.uid});
  await batch.commit();
  return {projectDefaultsNeedReview};
}
