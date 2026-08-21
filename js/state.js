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
  { id: 'server', name: '서버' },
  { id: 'qa', name: 'QA' },
  { id: 'pm', name: 'PM' }
];
const TASK_STATUS = {
  todo: '할 일', in_progress: '진행 중', blocked: '차단됨', done: '완료'
};

let currentUser = null;
let currentProfile = null;
let authResolved = false;
let activeView = 'projects';
let selectedProjectId = null;
let workViewMode = 'list';
let workCalendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let capacityWeekCursor = new Date();
let projects = [];
let tasks = [];
let milestones = [];
let projectUpdates = [];
let timeOffs = [];
let visibleUsers = [];
let accessRequests = [];

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
  timeOffs = [];
  visibleUsers = [];
  accessRequests = [];
}

function docToObject(doc){ return { id: doc.id, ...doc.data() }; }
function isAdmin(){ return currentProfile?.role === 'admin'; }
function isLead(){ return currentProfile?.role === 'lead'; }
function isMember(){ return currentProfile?.role === 'member'; }
function isApproved(){ return !!currentProfile?.active; }
function departmentName(id){ return DEPARTMENTS.find(x => x.id === id)?.name || id || '미지정'; }
function dateOnly(value){ return value ? String(value).slice(0, 10) : ''; }

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
function isWeekday(date){ return date.getDay() !== 0 && date.getDay() !== 6; }
function taskCoversDate(task, date){
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  if(!start || !end) return false;
  return date >= start && date <= end;
}
function taskDailyLoad(task, date){
  if(task.status === 'done' || !task.estimatedDays || !taskCoversDate(task, date) || !isWeekday(date) || absenceFor(task.assigneeId, date)) return 0;
  const start = localDate(task.startDate || task.dueDate); const end = localDate(task.dueDate || task.startDate);
  let workingDays = 0;
  for(let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) if(isWeekday(cursor)) workingDays++;
  return workingDays ? task.estimatedDays / workingDays : 0;
}
function absenceFor(userId, date){ return timeOffs.find(item => item.userId === userId && date >= localDate(item.startDate) && date <= localDate(item.endDate)); }
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
function canCreateTask(departmentId){
  return isApproved() && (isAdmin() || (isLead() && currentProfile.departmentId === departmentId));
}
function canManageProjects(){ return isApproved() && isAdmin(); }

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
  if(isAdmin()) {
    subscribeCollection(db.collection('projects'), data => { projects = data; }, '프로젝트');
    subscribeCollection(db.collection('tasks'), data => { tasks = data; }, '업무');
    subscribeCollection(db.collection('milestones'), data => { milestones = data; }, '마일스톤');
    subscribeCollection(db.collection('projectUpdates'), data => { projectUpdates = data; }, '프로젝트 업데이트');
    subscribeCollection(db.collection('timeOffs'), data => { timeOffs = data; }, '부재 일정');
    subscribeCollection(db.collection('users'), data => { visibleUsers = data.filter(user => user.active); }, '사용자');
    subscribeCollection(db.collection('accessRequests'), data => { accessRequests = data; }, '승인 요청');
  } else if(isLead()) {
    subscribeCollection(db.collection('projects'), data => { projects = data; }, '프로젝트');
    subscribeCollection(db.collection('tasks').where('departmentId', '==', currentProfile.departmentId), data => { tasks = data; }, '업무');
    subscribeCollection(db.collection('milestones'), data => { milestones = data; }, '마일스톤');
    subscribeCollection(db.collection('projectUpdates'), data => { projectUpdates = data; }, '프로젝트 업데이트');
    subscribeCollection(db.collection('timeOffs').where('departmentId', '==', currentProfile.departmentId), data => { timeOffs = data; }, '팀 부재 일정');
    subscribeCollection(db.collection('users').where('departmentId', '==', currentProfile.departmentId), data => { visibleUsers = data.filter(user => user.active); }, '팀원');
  } else {
    subscribeCollection(db.collection('tasks').where('assigneeId', '==', currentUser.uid), data => {
      subscribeProjectScopeForMember(data);
    }, '내 업무');
    subscribeCollection(db.collection('timeOffs').where('userId', '==', currentUser.uid), data => { timeOffs = data; }, '내 부재 일정');
  }
}

function handleProfile(profile){
  currentProfile = profile?.active ? profile : null;
  if(!currentProfile) {
    resetDataSubscriptions();
    setAppStatus('승인 대기 중');
  } else {
    setAppStatus(`${currentProfile.name || currentUser.displayName || currentUser.email} · ${currentProfile.role === 'admin' ? '관리자' : currentProfile.role === 'lead' ? departmentName(currentProfile.departmentId) + ' 팀장' : '팀원'}`);
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
      setAppStatus('로그인이 필요합니다');
      rerenderSafely();
      return;
    }
    setAppStatus('권한을 확인하는 중…');
    profileUnsubscribe = db.collection('users').doc(user.uid).onSnapshot(async doc => {
      if(!doc.exists) {
        try { await createAccessRequest(user); }
        catch(error) { console.error('승인 요청 생성 실패:', error); }
        handleProfile(null);
        return;
      }
      handleProfile({ id: doc.id, ...doc.data() });
    }, error => {
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

  const data = normalizeTask({ ...previous, ...input, title: input.title.trim(), departmentId, updatedBy: currentUser.uid });
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
  if(data.projectId) {
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

async function saveProject(input){
  if(!requirePermission(canManageProjects(), '프로젝트는 관리자만 관리할 수 있습니다.')) return;
  if(!input.name?.trim()) throw new Error('프로젝트 이름을 입력해주세요.');
  const ref = input.id ? db.collection('projects').doc(input.id) : db.collection('projects').doc();
  await ref.set({
    name: input.name.trim(), code: (input.code || '').trim(),
    versions: input.versions || [], status: input.status || 'active',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid,
    createdAt: input.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: input.createdBy || currentUser.uid
  }, { merge: true });
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

async function saveTimeOff(input){
  const targetId = input.userId || currentUser?.uid;
  const targetUser = targetId === currentUser?.uid ? currentProfile : visibleUsers.find(user => user.id === targetId);
  const allowed = isAdmin() || (isLead() && targetUser?.departmentId === currentProfile.departmentId) || targetId === currentUser?.uid;
  if(!requirePermission(allowed && isApproved(), '이 부재 일정을 등록할 권한이 없습니다.')) return;
  if(!input.startDate || !input.endDate || input.endDate < input.startDate) throw new Error('올바른 부재 기간을 입력해주세요.');
  const ref = input.id ? db.collection('timeOffs').doc(input.id) : db.collection('timeOffs').doc();
  await ref.set({
    userId: targetId, departmentId: targetUser?.departmentId || currentProfile.departmentId || null,
    type: input.type || 'leave', reason: (input.reason || '').trim(),
    startDate: input.startDate, endDate: input.endDate,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid,
    createdAt: input.createdAt || firebase.firestore.FieldValue.serverTimestamp(), createdBy: input.createdBy || currentUser.uid
  }, { merge: true });
}

async function deleteTimeOff(id){
  const item = timeOffs.find(timeOff => timeOff.id === id);
  const allowed = item && (isAdmin() || (isLead() && item.departmentId === currentProfile.departmentId) || item.userId === currentUser?.uid);
  if(!requirePermission(allowed, '이 부재 일정을 삭제할 권한이 없습니다.')) return;
  await db.collection('timeOffs').doc(id).delete();
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
    version: input.version || null, dueDate: input.dueDate || null,
    status: input.status || 'todo', archivedAt: input.archivedAt || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid,
    createdAt: input.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: input.createdBy || currentUser.uid
  }, { merge: true });
}

async function archiveMilestone(milestoneId){
  if(!requirePermission(canManageProjects(), '마일스톤은 관리자만 관리할 수 있습니다.')) return;
  await db.collection('milestones').doc(milestoneId).update({
    archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}

async function approveAccessRequest(requestId, role, departmentId){
  if(!requirePermission(isAdmin(), '사용자 권한은 관리자만 부여할 수 있습니다.')) return;
  const request = accessRequests.find(item => item.id === requestId);
  if(!request) throw new Error('승인 요청을 찾을 수 없습니다.');
  if(!['admin', 'lead', 'member'].includes(role)) throw new Error('올바른 역할을 선택해주세요.');
  if(role !== 'admin' && !departmentId) throw new Error('소속 부서를 선택해주세요.');
  const batch = db.batch();
  batch.set(db.collection('users').doc(requestId), {
    email: request.email || '', name: request.name || request.email || '이름 미지정',
    role, departmentId: role === 'admin' ? null : departmentId, active: true,
    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  }, { merge: true });
  batch.delete(db.collection('accessRequests').doc(requestId));
  await batch.commit();
}

async function saveUserRole(userId, role, departmentId){
  if(!requirePermission(isAdmin(), '사용자 권한은 관리자만 변경할 수 있습니다.')) return;
  if(!['admin', 'lead', 'member'].includes(role)) throw new Error('올바른 역할을 선택해주세요.');
  if(role !== 'admin' && !departmentId) throw new Error('소속 부서를 선택해주세요.');
  await db.collection('users').doc(userId).update({
    role, departmentId: role === 'admin' ? null : departmentId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid
  });
}
