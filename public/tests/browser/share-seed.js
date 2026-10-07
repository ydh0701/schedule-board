/* Synthetic data only. No names, dates, or schedules copied from live work. */
function seedOfficeTestData(reset=false){
  if(window.testStore.size && !reset)return;
  window.testStore.clear();
  const today=new Date();today.setHours(12,0,0,0);
  const date=offset=>{const value=new Date(today);value.setDate(value.getDate()+offset);return dateKey(value);};
  const roles=[['planning','기획','planning_01'],['ui','UI','ui_01'],['development','개발','dev_01'],['qa','QA','qa_01'],['business','글로벌비즈니스실','business_01'],['video_partner','영상 파트너',null]];
  const stages=['프로젝트 준비','영상 준비','데모 준비','완전판 준비'].map((name,index)=>({id:'m'+(index+1),name,order:index+1}));
  [['sample_pc','SAMPLE01','샘플 펜싱 프로젝트','pc',false],['sample_mobile','SAMPLE02','샘플 드라마 프로젝트','mobile',false],['sample_console','SAMPLE03','샘플 생존 프로젝트','console',false],['sample_done','SAMPLE04','샘플 완료 프로젝트','pc',true]].forEach(([id,code,name,platform,complete],index)=>{
    const assignments=roles.map(([departmentId,,assigneeId])=>({departmentId,assignmentType:assigneeId?'internal_user':'external_text',...(assigneeId?{assigneeId}:{externalAssigneeName:'샘플 영상사'})}));
    window.testStore.set('projects/'+id,{name,code,platforms:[platform],status:complete?'completed':'active',schedulingMode:'template_v2',projectAssignments:assignments,staffing:roles.filter(role=>role[2]).map(([departmentId,,userId])=>({platform,departmentId,userId})),roleSnapshots:roles.map(([id,name],order)=>({id,name,order})),stageSnapshots:stages});
    const items=[['콘셉트 기획서 작성','planning','in_progress',-1,2,40],['가편 영상 검수','planning','todo',3,5,0],['완전판 데이터 작성','planning','todo',null,null,0],['데모 UI 제작','ui','in_progress',0,5,30],['인게임 UI 보완','ui','todo',4,8,0],['데모 빌드 제작','development','todo',7,10,0],['런칭 QA','qa','todo',11,13,0],['스토어 오픈','business','todo',14,14,0],['가편 영상 납품','video_partner','todo',0,2,0],['지연 기획 검토','planning','todo',-5,-2,0],['완료 기획 검토','planning','done',-8,-6,100],['개별 지원 업무','planning','todo',6,8,0]];
    items.forEach(([title,departmentId,status,start,end,progress],taskIndex)=>{
      const owner=taskIndex===11?'planning_lead':roles.find(role=>role[0]===departmentId)[2];
      const support=taskIndex===0;
      const startDate=start===null?null:date(complete?-15:index*2+start),dueDate=end===null?null:date(complete?-10:index*2+end);
      window.testStore.set('tasks/'+id+'_'+taskIndex,{projectId:id,platform,departmentId,stageId:'m'+(taskIndex<3?1:taskIndex<6?2:taskIndex<9?3:4),title,status:complete?'done':status,progress:complete?100:progress,startDate,dueDate,estimatedDays:2,generated:taskIndex!==11,sourceType:taskIndex===11?'manual':'template',assigneeId:owner,assigneeIds:owner?[owner,...(support?['planning_lead']:[])]:[],assignees:owner?[{userId:owner,role:'primary',share:support?0.7:1},...(support?[{userId:'planning_lead',role:'co',share:0.3}]:[])]:[],...(owner?{}:{externalAssigneeName:'샘플 영상사',datePolicy:'anchor'}),...(taskIndex===1?{scheduleRule:{type:'after_task',predecessorId:id+'_8',offsetWorkdays:1}}:{}),archivedAt:null});
    });
  });
  window.persistTestStore();
}
seedOfficeTestData();
