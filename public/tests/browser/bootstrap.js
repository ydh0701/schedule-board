visibleUsers = [
  {id:'planning_lead',name:'테스트 기획팀장',departmentId:'planning',active:true,role:'lead'},
  {id:'admin',name:'테스트 관리자',departmentId:'planning',active:true,role:'admin'},
  {id:'planning_01',name:'기획 담당자',departmentId:'planning',active:true,role:'member'},
  {id:'ui_01',name:'UI 담당자',departmentId:'ui',active:true,role:'member'},
  {id:'dev_01',name:'개발 담당자',departmentId:'development',active:true,role:'member'},
  {id:'qa_01',name:'QA 담당자',departmentId:'qa',active:true,role:'member'},
  {id:'business_01',name:'글로벌비즈니스 담당자',departmentId:'business',active:true,role:'member'}
];
holidays=[{id:'2026-10-09',date:'2026-10-09'}];
authResolved=true;
workDataReadiness={tasks:true,holidays:true};
function testIdentity(id){
  currentUser={uid:id};currentProfile=visibleUsers.find(user=>user.id===id);
  activeView='projects';selectedProjectId=null;rerender();
}
window.refreshTestData=()=>{
  const load=collection=>[...window.testStore.entries()].filter(([key])=>key.split('/').length===2&&key.startsWith(collection+'/')).map(([key,value])=>({...value,id:key.split('/')[1]}));
  projects=load('projects');tasks=load('tasks');
  document.getElementById('testCounts').textContent=`프로젝트 ${projects.length}개 · 업무 ${tasks.length}개`;
  rerender();
};
document.getElementById('testIdentity').onchange=event=>testIdentity(event.target.value);
document.getElementById('testCreate').onclick=openProjectCreator;
testIdentity('admin');window.refreshTestData();
