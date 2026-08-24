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
  { id: 'studio', name: '제작실' },
  { id: 'pm', name: 'PM' }
];
const TASK_STATUS = {
  todo: '할 일', in_progress: '진행 중', blocked: '차단됨', done: '완료'
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
const TEMPLATE_DEPARTMENTS = ['planning', 'ui', 'development', 'qa'];
// 현재 전달받은 기획·UI 마일스톤에서 반복되는 흐름을 기준으로 한 첫 템플릿입니다.
// 실제 운영 중 평균 작업일은 템플릿 관리 화면에서 계속 조정할 수 있게 확장합니다.
const PROJECT_WORK_TEMPLATE = [
  { key: 'demo-plan', departmentId: 'planning', title: '데모 기능·화면 기획 확정', anchorKey: 'demo_build', dueOffset: -18, estimatedDays: 3 },
  { key: 'demo-ui-design', departmentId: 'ui', title: '데모 UI 디자인', anchorKey: 'demo_build', dueOffset: -15, estimatedDays: 4, dependsOnKey: 'demo-plan' },
  { key: 'demo-ui-prefab', departmentId: 'ui', title: '데모 UI 프리팹·연출', anchorKey: 'demo_build', dueOffset: -9, estimatedDays: 3, dependsOnKey: 'demo-ui-design' },
  { key: 'demo-dev', departmentId: 'development', title: '데모 기능 구현·연동', anchorKey: 'demo_build', dueOffset: -10, estimatedDays: 5, dependsOnKey: 'demo-plan' },
  { key: 'demo-qa', departmentId: 'qa', title: '데모 QA·수정 확인', anchorKey: 'demo_build', dueOffset: -4, estimatedDays: 3, dependsOnKey: 'demo-ui-prefab' },
  { key: 'full-plan', departmentId: 'planning', title: '완전판 기능·화면 기획 확정', anchorKey: 'full_build', dueOffset: -28, estimatedDays: 4 },
  { key: 'full-ui-design', departmentId: 'ui', title: '완전판 UI 디자인', anchorKey: 'full_build', dueOffset: -22, estimatedDays: 5, dependsOnKey: 'full-plan' },
  { key: 'full-ui-prefab', departmentId: 'ui', title: '완전판 UI 프리팹·연출', anchorKey: 'full_build', dueOffset: -14, estimatedDays: 4, dependsOnKey: 'full-ui-design' },
  { key: 'full-dev', departmentId: 'development', title: '완전판 기능 구현·연동', anchorKey: 'full_build', dueOffset: -15, estimatedDays: 7, dependsOnKey: 'full-plan' },
  { key: 'full-qa', departmentId: 'qa', title: '완전판 QA·수정 확인', anchorKey: 'full_build', dueOffset: -6, estimatedDays: 4, dependsOnKey: 'full-ui-prefab' }
];

let currentUser = null;
let currentProfile = null;
let authResolved = false;
let activeView = 'home';
let selectedProjectId = null;
let projectTimelineFilter = 'all';
let projectScheduleCursor = null;
let workViewMode = 'list';
let workCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let capacityWeekCursor = new Date();
let projects = [];
let tasks = [];
let milestones = [];
let projectUpdates = [];
let holidays = [];
let visibleUsers = [];
let accessRequests = [];
let profileLookup = { status: 'idle', uid: '', message: '' };

let profileUnsubscribe = null;
let dataUnsubscribers = [];
let scopedProjectUnsubscribers = [];

function setAppStatus(message){
  const el = document.getElementById('appStatus');
  if(el) el.textContent = message;
}

function rerenderSafely(){
  if(typeof rerender === 'function') rerender();
}

function resetDataSubscriptions(){
  dataUnsubscribers.forEach(unsub => unsub());
  scopedProjectUnsubscribers.forEach(unsub => unsub());
  dataUnsubscribers = [];
  scopedProjectUnsubscribers = [];
  projects = [];
  tasks = [];
  milestones = [];
  projectUpdates = [];
  holidays = [];
  visibleUsers = [];
  accessRequests = [];
}

function docToObject(doc){ return { id: doc.id, ...doc.data() }; }
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
function dateOnly(value){ return value ? String(value).slice(0, 10) : ''; }
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
  return task;
}

function activeTasks(){ return tasks.filter(task => !task.archivedAt); }
function taskIsOverdue(task){
  return !task.archivedAt && task.status !== 'done' && !!task.dueDate && dateOnly(task.dueDate) < new Date().toISOString().slice(0, 10);
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
function taskDependencies(task){ return (task?.dependsOn || []).map(id => tasks.find(item => item.id === id)).filter(Boolean); }
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
function taskCoversDate(task, date){
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  if(!start || !end) return false;
  return date >= start && date <= end;
}
function taskDailyLoad(task, date){
  if(task.status === 'done' || !task.estimatedDays || !taskCoversDate(task, date) || !isWeekday(date)) return 0;
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  let workingDays = 0;
  for(let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) if(isWeekday(cursor)) workingDays++;
  return workingDays ? task.estimatedDays / workingDays : 0;
}
function userWeeklyCapacity(userId){
  const user = userId === currentUser?.uid ? currentProfile : visibleUsers.find(item => item.id === userId);
  return Math.max(1, Number(user?.weeklyCapacity || 5));
}
function taskLoadForUserOnDate(userId, date, extraTask = null){
  const list = activeTasks().filter(task => task.assigneeId === userId && task.status !== 'done');
  if(extraTask) list.push(extraTask);
  return list.reduce((sum, task) => sum + taskDailyLoad(task, date), 0);
}
function nextAvailableDate(userId, extraTask = null){
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  for(let index = 0; index < 90; index++) {
    if(isWeekday(cursor) && taskLoadForUserOnDate(userId, cursor, extraTask) < 0.8) return dateKey(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}
function assignmentAssessment(userId, task){
  if(!userId || !task) return { level: 'unknown', label: '담당자를 선택해주세요.', weeklyLoad: 0, nextDate: null, overflowDays: 0 };
  const candidate = { ...task, assigneeId: userId, status: task.status || 'todo' };
  const start = localDate(candidate.startDate || dateKey(new Date()));
  const end = localDate(candidate.dueDate || candidate.startDate || dateKey(new Date()));
  let overflowDays = 0, workingDays = 0, totalLoad = 0;
  for(let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if(!isWeekday(cursor)) continue;
    workingDays++;
    const load = taskLoadForUserOnDate(userId, cursor, candidate);
    totalLoad += load;
    if(load > 1) overflowDays++;
  }
  const weeklyLoad = Math.round((totalLoad / Math.max(1, userWeeklyCapacity(userId))) * 100);
  const nextDate = nextAvailableDate(userId, candidate);
  const missingDates = !candidate.startDate || !candidate.dueDate || !candidate.estimatedDays;
  if(missingDates) return { level: 'unknown', label: '기간과 예상 작업일을 입력하면 가용성을 계산할 수 있습니다.', weeklyLoad, nextDate, overflowDays };
  if(overflowDays > 0 || weeklyLoad > 100) return { level: 'danger', label: `기존 업무와 ${overflowDays || 1}일 겹쳐 과부하가 예상됩니다.`, weeklyLoad, nextDate, overflowDays };
  if(weeklyLoad >= 80) return { level: 'warn', label: '업무량이 높은 편입니다. 마감일까지 완료 가능 여부를 확인해주세요.', weeklyLoad, nextDate, overflowDays };
  return { level: 'ok', label: '마감일 내 완료 가능한 여유가 있습니다.', weeklyLoad, nextDate, overflowDays };
}
function wouldCreateDependencyCycle(taskId, candidateId){
  if(!taskId || !candidateId) return false;
  const visit = (id, visited = new Set()) => {
    if(id === taskId) return true;
    if(visited.has(id)) return false;
    visited.add(id);
    const task = tasks.find(item => item.id === id);
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
  if(isAdmin()) return true;
  if(isLead()) return task.departmentId === currentProfile.departmentId;
  return task.assigneeId === currentUser?.uid;
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
  const unsubscribe = query.onSnapshot(snapshot => {
    apply(snapshot.docs.map(docToObject));
    rerenderSafely();
  }, error => {
    console.error(`${label} 구독 실패:`, error);
    setAppStatus('데이터를 불러오지 못했습니다');
    rerenderSafely();
  });
  dataUnsubscribers.push(unsubscribe);
}

function subscribeProjectScopeForMember(ownTasks){
  scopedProjectUnsubscribers.forEach(unsub => unsub());
  scopedProjectUnsubscribers = [];
  const projectIds = [...new Set(ownTasks.map(task => task.projectId).filter(Boolean))];
  const scopedProjects = new Map();
  const scopedTasks = new Map();
  const scopedMilestones = new Map();
  const scopedUpdates = new Map();

  const publish = () => {
    projects = [...scopedProjects.values()].sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name)));
    const own = ownTasks.map(task => [task.id, task]);
    tasks = [...new Map([...own, ...scopedTasks]).values()];
    milestones = [...scopedMilestones.values()];
    projectUpdates = [...scopedUpdates.values()];
    rerenderSafely();
  };

  projectIds.forEach(projectId => {
    scopedProjectUnsubscribers.push(db.collection('projects').doc(projectId).onSnapshot(doc => {
      if(doc.exists) scopedProjects.set(doc.id, docToObject(doc));
      publish();
    }, error => console.error('프로젝트 구독 실패:', error)));
    // Firestore 규칙은 projectMembers/{projectId_uid} 존재 여부를 검사해 이 쿼리를 허용합니다.
    scopedProjectUnsubscribers.push(db.collection('tasks').where('projectId', '==', projectId).onSnapshot(snapshot => {
      snapshot.docs.forEach(doc => scopedTasks.set(doc.id, docToObject(doc)));
      publish();
    }, error => console.error('프로젝트 업무 구독 실패:', error)));
    scopedProjectUnsubscribers.push(db.collection('milestones').where('projectId', '==', projectId).onSnapshot(snapshot => {
      snapshot.docs.forEach(doc => scopedMilestones.set(doc.id, docToObject(doc)));
      publish();
    }, error => console.error('프로젝트 마일스톤 구독 실패:', error)));
    scopedProjectUnsubscribers.push(db.collection('projectUpdates').where('projectId', '==', projectId).onSnapshot(snapshot => {
      snapshot.docs.forEach(doc => scopedUpdates.set(doc.id, docToObject(doc)));
      publish();
    }, error => console.error('프로젝트 업데이트 구독 실패:', error)));
  });
  publish();
}

function subscribeApprovedData(){
  resetDataSubscriptions();
  if(isAdmin() || isPM()) {
    subscribeCollection(db.collection('projects'), data => { projects = data; }, '프로젝트');
    subscribeCollection(db.collection('tasks'), data => { tasks = data; }, '업무');
    subscribeCollection(db.collection('milestones'), data => { milestones = data; }, '마일스톤');
    subscribeCollection(db.collection('projectUpdates'), data => { projectUpdates = data; }, '프로젝트 업데이트');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; }, '공휴일');
    subscribeCollection(db.collection('users'), data => { visibleUsers = data; }, '사용자');
    subscribeCollection(db.collection('accessRequests'), data => { accessRequests = data; }, '승인 요청');
  } else if(isLead()) {
    subscribeCollection(db.collection('projects'), data => { projects = data; }, '프로젝트');
    subscribeCollection(db.collection('tasks').where('departmentId', '==', currentProfile.departmentId), data => { tasks = data; }, '업무');
    subscribeCollection(db.collection('milestones'), data => { milestones = data; }, '마일스톤');
    subscribeCollection(db.collection('projectUpdates'), data => { projectUpdates = data; }, '프로젝트 업데이트');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; }, '공휴일');
    subscribeCollection(db.collection('users').where('departmentId', '==', currentProfile.departmentId), data => { visibleUsers = data; }, '팀원');
  } else {
    subscribeCollection(db.collection('tasks').where('assigneeId', '==', currentUser.uid), data => {
      subscribeProjectScopeForMember(data);
    }, '내 업무');
    subscribeCollection(db.collection('holidays'), data => { holidays = data; }, '공휴일');
  }
}

function handleProfile(profile){
  currentProfile = profile?.active ? profile : null;
  if(!currentProfile) {
    resetDataSubscriptions();
    setAppStatus('승인 대기 중');
  } else {
    activeView = isPM() ? 'projects' : isLead() ? 'team' : 'my-work';
    setAppStatus(`${currentProfile.name || currentUser.displayName || currentUser.email} · ${userRoleLabel(currentProfile)}${isLead() && currentProfile.departmentId ? ' · ' + departmentName(currentProfile.departmentId) : ''}`);
    subscribeApprovedData();
  }
  rerenderSafely();
}

function startAuth(){
  // 네트워크·브라우저 확장 프로그램 등으로 인증 초기 응답이 지연돼도 빈 화면에 머물지 않게 합니다.
  const authFallbackTimer = setTimeout(() => {
    if(authResolved) return;
    authResolved = true;
    setAppStatus('로그인 상태를 확인해주세요');
    rerenderSafely();
  }, 4000);
  auth.onAuthStateChanged(async user => {
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
    profileUnsubscribe = db.collection('users').doc(user.uid).onSnapshot(async doc => {
      if(!doc.exists) {
        // 최초 구독은 브라우저 캐시의 오래된 "문서 없음" 상태를 받을 수 있습니다.
        // 서버를 한 번 직접 확인해 실제 관리자 문서가 있으면 즉시 반영합니다.
        try {
          const serverDoc = await db.collection('users').doc(user.uid).get({ source: 'server' });
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
          profileLookup = { status: 'error', uid: user.uid, message: error.code || error.message || 'unknown' };
          console.error('서버 권한 정보 확인 실패:', error);
          setAppStatus('권한 정보를 확인할 수 없습니다');
          handleProfile(null);
          return;
        }
        profileLookup = { status: 'missing', uid: user.uid, message: '' };
        try { await createAccessRequest(user); }
        catch(error) { console.error('승인 요청 생성 실패:', error); }
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
      profileLookup = { status: 'error', uid: user.uid, message: error.code || error.message || 'unknown' };
      console.error('권한 정보 확인 실패:', error);
      setAppStatus('권한 정보를 확인할 수 없습니다');
      rerenderSafely();
    });
  }, error => {
    clearTimeout(authFallbackTimer);
    authResolved = true;
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
  const isNew = !input.id;
  const previous = isNew ? null : tasks.find(task => task.id === input.id);
  const departmentId = input.departmentId || previous?.departmentId;
  if(!requirePermission(isNew ? canCreateTask(departmentId) : canEditTask(previous), '이 업무를 수정할 권한이 없습니다.')) return;
  if(!input.title?.trim()) throw new Error('업무 제목을 입력해주세요.');
  if(!input.assigneeId) throw new Error('담당자를 지정해주세요.');
  if(isNew && !canCreateTask(departmentId, input.assigneeId)) throw new Error('다른 사람의 업무는 팀장, PM 또는 관리자만 등록할 수 있습니다.');

  const data = normalizeTask({ ...previous, ...input, title: input.title.trim(), departmentId, assigneeName: personName(input.assigneeId), updatedBy: currentUser.uid });
  if(data.milestoneId) {
    const milestone = milestones.find(item => item.id === data.milestoneId);
    if(!milestone || milestone.projectId !== data.projectId) throw new Error('선택한 마일스톤은 연결 프로젝트에 속해야 합니다.');
  }
  if(data.dependsOn.includes(input.id)) throw new Error('업무는 자기 자신을 선행 업무로 지정할 수 없습니다.');
  if(data.dependsOn.some(dependencyId => wouldCreateDependencyCycle(input.id, dependencyId))) {
    throw new Error('순환 선행 관계가 생깁니다. 선행 업무를 다시 선택해주세요.');
  }
  const ref = isNew ? db.collection('tasks').doc() : db.collection('tasks').doc(input.id);
  const batch = db.batch();
  batch.set(ref, {
    ...data,
    id: firebase.firestore.FieldValue.delete(),
    createdBy: previous?.createdBy || currentUser.uid,
    createdAt: previous?.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  // 프로젝트 구성원 문서가 있어야 팀원이 해당 프로젝트의 전체 흐름을 읽을 수 있습니다.
  if(data.projectId && (isAdmin() || isPM() || isLead())) {
    batch.set(db.collection('projectMembers').doc(`${data.projectId}_${data.assigneeId}`), {
      projectId: data.projectId, userId: data.assigneeId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

async function archiveTask(taskId){
  const task = tasks.find(item => item.id === taskId);
  if(!requirePermission(canEditTask(task), '이 업무를 보관할 권한이 없습니다.')) return;
  await db.collection('tasks').doc(taskId).update({
    archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser.uid
  });
}

async function reassignTask(taskId, assigneeId, force = false){
  const task = tasks.find(item => item.id === taskId);
  if(!task) throw new Error('업무를 찾을 수 없습니다.');
  if(!requirePermission(canEditTask(task), '이 업무의 담당자를 변경할 권한이 없습니다.')) return;
  if(!assigneeId) throw new Error('새 담당자를 선택해주세요.');
  const target = activeUsers().find(user => user.id === assigneeId) || (assigneeId === currentUser?.uid ? currentProfile : null);
  if(!target?.active) throw new Error('활성 상태의 담당자만 배정할 수 있습니다.');
  const assessment = assignmentAssessment(assigneeId, task);
  if(assessment.level === 'danger' && !force) {
    const error = new Error('대상자가 과부하 상태입니다. 경고를 확인한 뒤 다시 배정해주세요.');
    error.code = 'OVER_CAPACITY'; error.assessment = assessment; throw error;
  }
  const batch = db.batch();
  batch.update(db.collection('tasks').doc(taskId), {
    assigneeId, assigneeName: target.name || target.email || '이름 미지정', needsAssignment: false,
    previousAssigneeId: task.assigneeId || null, previousAssigneeName: task.assigneeId ? personName(task.assigneeId) : '담당자 미배정',
    assignmentWarning: assessment.level === 'danger' ? assessment.label : null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
  if(task.projectId && (isAdmin() || isPM() || isLead())) batch.set(db.collection('projectMembers').doc(`${task.projectId}_${assigneeId}`), {
    projectId: task.projectId, userId: assigneeId, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();
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

async function rescheduleGeneratedTasks(projectId, milestoneOverrides = {}){
  if(!requirePermission(canManageProjects(), '일정 재계산은 관리자 또는 PM만 실행할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  const anchors = projectMilestoneMap(projectId, milestoneOverrides);
  const generated = tasksForProject(projectId).filter(task => task.generated && task.scheduleRule && !task.dateOverride);
  const batch = db.batch();
  generated.forEach(task => {
    const rule = task.scheduleRule;
    const dates = scheduledDates(anchors[rule.anchorKey], rule.dueOffset, rule.estimatedDays || task.estimatedDays);
    batch.update(db.collection('tasks').doc(task.id), { startDate: dates.startDate, dueDate: dates.dueDate, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  });
  if(generated.length) await batch.commit();
}

async function syncProjectStaffing(projectId, staffing){
  if(!requirePermission(canManageProjects(), '담당자 배정은 관리자 또는 PM만 변경할 수 있습니다.')) return;
  const project = projects.find(item => item.id === projectId);
  if(!project) throw new Error('프로젝트를 찾을 수 없습니다.');
  const cleaned = (staffing || []).filter(item => (project.platforms || []).includes(item.platform) && TEMPLATE_DEPARTMENTS.includes(item.departmentId))
    .map(item => ({ platform: item.platform, departmentId: item.departmentId, userId: item.userId || null }));
  const batch = db.batch();
  batch.update(db.collection('projects').doc(projectId), { staffing: cleaned, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  tasksForProject(projectId).filter(task => task.generated).forEach(task => {
    const staff = staffingFor({ staffing: cleaned }, task.platform, task.departmentId);
    batch.update(db.collection('tasks').doc(task.id), { assigneeId: staff?.userId || null, assigneeName: staff?.userId ? personName(staff.userId) : null, needsAssignment: !staff?.userId, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  });
  cleaned.filter(item => item.userId).forEach(item => {
    batch.set(db.collection('projectMembers').doc(`${projectId}_${item.userId}`), {
      projectId, userId: item.userId, platforms: firebase.firestore.FieldValue.arrayUnion(item.platform), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}

async function saveProjectUpdate(input){
  if(!requirePermission(isAdmin() || isLead(), '프로젝트 업데이트는 팀장 또는 관리자만 작성할 수 있습니다.')) return;
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
  let comments = [], links = [];
  const publish = () => onChange({ comments, links });
  const unsubComments = db.collection('tasks').doc(taskId).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snapshot => {
    comments = snapshot.docs.map(docToObject); publish();
  }, error => console.error('댓글 구독 실패:', error));
  const unsubLinks = db.collection('tasks').doc(taskId).collection('links').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    links = snapshot.docs.map(docToObject); publish();
  }, error => console.error('링크 구독 실패:', error));
  return () => { unsubComments(); unsubLinks(); };
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
  if(!requirePermission(canManageProjects(), '마일스톤은 관리자만 관리할 수 있습니다.')) return;
  if(!input.projectId || !input.title?.trim()) throw new Error('프로젝트와 마일스톤 제목을 입력해주세요.');
  const ref = input.id ? db.collection('milestones').doc(input.id) : db.collection('milestones').doc();
  await ref.set({
    projectId: input.projectId, title: input.title.trim(),
    version: input.version || null, anchorKey: input.anchorKey || null, dueDate: input.dueDate || null,
    status: input.status || 'todo', archivedAt: input.archivedAt || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid,
    createdAt: input.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: input.createdBy || currentUser.uid
  }, { merge: true });
  if(input.anchorKey) await rescheduleGeneratedTasks(input.projectId, { [input.anchorKey]: input.dueDate });
}

async function archiveMilestone(milestoneId){
  if(!requirePermission(canManageProjects(), '마일스톤은 관리자만 관리할 수 있습니다.')) return;
  await db.collection('milestones').doc(milestoneId).update({
    archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

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

function unfinishedTasksForUser(userId){ return activeTasks().filter(task => task.assigneeId === userId && task.status !== 'done'); }

async function offboardUser(userId, decisions){
  const user = visibleUsers.find(item => item.id === userId);
  if(!requirePermission(canManageOffboarding(user), '퇴사 처리는 관리자·PM 또는 해당 부서 팀장만 할 수 있습니다.')) return;
  if(userId === currentUser?.uid) throw new Error('본인 계정은 직접 퇴사 처리할 수 없습니다. 다른 관리자 또는 PM에게 요청해주세요.');
  if(!user?.active) throw new Error('이미 비활성화된 사용자입니다.');
  const unresolved = unfinishedTasksForUser(userId);
  const decisionByTask = new Map((decisions || []).map(item => [item.taskId, item]));
  if(unresolved.some(task => !decisionByTask.has(task.id))) throw new Error('진행 중·예정 업무의 처리 방식을 모두 선택해주세요.');

  const batch = db.batch();
  const updatedStaffing = new Map();
  unresolved.forEach(task => {
    const decision = decisionByTask.get(task.id);
    if(!['reassign', 'unassign', 'archive'].includes(decision.action)) throw new Error('업무 처리 방식을 확인해주세요.');
    if(decision.action === 'reassign') {
      const replacement = activeUsers().find(item => item.id === decision.userId);
      if(!replacement) throw new Error('재배정할 현재 직원을 선택해주세요.');
      if(!isAdmin() && replacement.departmentId !== user.departmentId) throw new Error('팀장은 자기 부서 직원에게만 재배정할 수 있습니다.');
      batch.update(db.collection('tasks').doc(task.id), {
        assigneeId: replacement.id, assigneeName: replacement.name || replacement.email || '이름 미지정', needsAssignment: false,
        previousAssigneeId: userId, previousAssigneeName: user.name || user.email || '', handoverAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
      });
      if(task.projectId && task.platform) {
        const project = projects.find(item => item.id === task.projectId);
        if(project) {
          const key = project.id;
          const staffing = updatedStaffing.get(key) || (project.staffing || []).map(item => ({ ...item }));
          staffing.forEach(item => { if(item.platform === task.platform && item.departmentId === task.departmentId && item.userId === userId) item.userId = replacement.id; });
          updatedStaffing.set(key, staffing);
        }
      }
      if(task.projectId) batch.set(db.collection('projectMembers').doc(`${task.projectId}_${replacement.id}`), { projectId: task.projectId, userId: replacement.id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } else if(decision.action === 'unassign') {
      batch.update(db.collection('tasks').doc(task.id), {
        assigneeId: null, assigneeName: '담당자 미배정', needsAssignment: true,
        previousAssigneeId: userId, previousAssigneeName: user.name || user.email || '', handoverAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
      });
      if(task.projectId && task.platform) {
        const project = projects.find(item => item.id === task.projectId);
        if(project) {
          const key = project.id;
          const staffing = updatedStaffing.get(key) || (project.staffing || []).map(item => ({ ...item }));
          staffing.forEach(item => { if(item.platform === task.platform && item.departmentId === task.departmentId && item.userId === userId) item.userId = null; });
          updatedStaffing.set(key, staffing);
        }
      }
    } else {
      batch.update(db.collection('tasks').doc(task.id), {
        archivedAt: firebase.firestore.FieldValue.serverTimestamp(), offboardingAction: 'archived',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
      });
    }
  });
  updatedStaffing.forEach((staffing, projectId) => {
    batch.update(db.collection('projects').doc(projectId), { staffing, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid });
  });
  batch.update(db.collection('users').doc(userId), {
    active: false, employmentStatus: 'departed', offboardedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
  await batch.commit();
}

