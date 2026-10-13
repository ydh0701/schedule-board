// Move the actual fixture controls; existing handlers and later opt-in buttons stay attached.
const testControls=document.querySelector('.test-controls'),testSidebar=document.querySelector('.app-sidebar');
if(testControls&&testSidebar){
  const dock=document.createElement('details');dock.className='guide-test-dock';
  const summary=document.createElement('summary');summary.title='샘플 테스트 도구';summary.setAttribute('aria-label','샘플 테스트 도구');
  const label=document.createElement('span');label.textContent='테스트 도구';summary.appendChild(label);
  dock.append(summary,testControls);testSidebar.appendChild(dock);
}
visibleUsers = [
  {id:'planning_lead',name:'테스트 기획팀장',departmentId:'planning',active:true,role:'lead'},
  {id:'admin',name:'테스트 관리자',departmentId:'planning',active:true,role:'admin'},
  {id:'pm_01',name:'테스트 PM',departmentId:'pm',active:true,role:'pm'},
  {id:'observer_01',name:'추가 조회 참여자',departmentId:'studio',active:true,role:'member'},
  {id:'planning_01',name:'기획 담당자',departmentId:'planning',active:true,role:'member'},
  {id:'ui_01',name:'UI 담당자',departmentId:'ui',active:true,role:'member'},
  {id:'dev_01',name:'개발 담당자',departmentId:'development',active:true,role:'member'},
  {id:'qa_01',name:'QA 담당자',departmentId:'qa',active:true,role:'member'},
  {id:'business_01',name:'글로벌비즈니스 담당자',departmentId:'business',active:true,role:'member'}
];
holidays=[{id:'2026-10-09',date:'2026-10-09'}];
for(const user of visibleUsers)if(!window.testStore.has('users/'+user.id)){const {id,...data}=user;window.testStore.set('users/'+id,data);}
authResolved=true;
installConnectionMonitoring();
workDataReadiness={tasks:true,holidays:true};
function testIdentity(id){
  invalidateSessionUI();
  currentUser={uid:id};currentProfile=visibleUsers.find(user=>user.id===id);
  activeView='home';selectedProjectId=null;window.refreshTestData();
}
window.refreshTestData=()=>{
  const load=collection=>[...window.testStore.entries()].filter(([key])=>key.split('/').length===2&&key.startsWith(collection+'/')).map(([key,value])=>({...value,id:key.split('/')[1]}));
  const allProjects=load('projects'),allTasks=load('tasks');projectMemberships=load('projectMembers').filter(item=>item.userId===currentUser?.uid);
  if(!currentProfile||isAdmin()||isPM()){projects=allProjects;tasks=allTasks;}
  else{
    const teamIds=visibleUsers.filter(user=>user.departmentId===currentProfile.departmentId).map(user=>user.id);
    projects=MilestoneDashboardModel.relatedProjects(allProjects,allTasks,{id:currentUser.uid,...currentProfile},projectMemberships,teamIds);
    const ids=new Set(projects.map(project=>project.id));tasks=allTasks.filter(task=>ids.has(task.projectId));
  }
  document.getElementById('testCounts').textContent=`조회 프로젝트 ${projects.length}개 · 업무 ${tasks.length}개`;
  const visibleProjectIds=new Set(projects.map(project=>project.id));
  milestones=load('milestones').filter(item=>visibleProjectIds.has(item.projectId));projectUpdates=load('projectUpdates').filter(item=>visibleProjectIds.has(item.projectId));
  requestDataRender();
};
document.getElementById('testIdentity').onchange=event=>testIdentity(event.target.value);
for(const user of visibleUsers.filter(user=>!document.querySelector(`#testIdentity option[value="${user.id}"]`))){const option=new Option(user.name,user.id);document.getElementById('testIdentity').add(option);}
document.getElementById('testCreate').onclick=openProjectCreator;
window.refreshTestData();testIdentity('admin');
