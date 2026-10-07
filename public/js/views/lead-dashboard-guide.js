/* Lead dashboard reuses the team timeline and calendar; no duplicate business records. */
const guideLeadDashboardView={view:'team',mentionTab:'direct',today:null,owner:null,
  team:{department:'',query:'',weeks:8,followToday:true},
  calendar:{month:null,today:null,followToday:true,view:'calendar',query:'',project:'',platform:'',kind:'all',status:'all',sort:'start',fields:{project:true,title:true,dates:false}}};
function renderGuideLeadDashboard(main){
  const state=guideLeadDashboardView,today=dateKey(todayDate());
  if(state.owner!==currentUser.uid){state.owner=currentUser.uid;state.team={department:'',query:'',weeks:8,followToday:true};Object.assign(state.calendar,{month:null,today:null,followToday:true,query:'',project:'',platform:''});}
  state.today=today;
  const scope=MilestonePersonalModel.viewers(activeUsers(),{...currentProfile,id:currentUser.uid},{team:true});
  const data=MilestoneDashboardModel.teamOverview(projects,activeTasks(),milestones,currentProfile.departmentId,today);
  const layout=el('div','guide-dashboard-layout guide-lead-dashboard'),sidebar=el('aside','guide-dashboard-sidebar'),right=el('section','guide-dashboard-calendar-panel');
  const mentions=el('details','guide-dashboard-panel guide-mentions-panel');mentions.open=state.mentionsExpanded!==false;mentions.ontoggle=()=>{state.mentionsExpanded=mentions.open;};mentions.appendChild(el('summary','','받은 멘션'));
  const mentionTabs=el('div','guide-page-tabs guide-mention-tabs');mentionTabs.setAttribute('role','tablist');mentionTabs.setAttribute('aria-label','멘션 대상');
  [['direct','나에게 온 멘션'],['all','@모두']].forEach(([id,label])=>{const tab=button(label,state.mentionTab===id?'active':'',()=>{state.mentionTab=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(id===state.mentionTab));mentionTabs.appendChild(tab);});
  mentions.appendChild(mentionTabs);
  const empty=el('div','guide-mention-connection');empty.append(el('strong','','Google Chat 미연결'),el('p','','연결 후 스페이스명 또는 개인 채팅 상대 이름과 멘션 날짜를 표시합니다. 메시지 내용은 표시하지 않습니다.'),el('small','','계정 연결 기능은 아직 준비 중입니다.'));
  mentions.appendChild(empty);sidebar.appendChild(mentions);
  const tabs=el('div','guide-page-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','팀장 대시보드 보기');
  [['team','팀 배치'],['major','주요 일정']].forEach(([id,label])=>{const tab=button(label,state.view===id?'active':'',()=>{state.view=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.view===id));tabs.appendChild(tab);});main.appendChild(tabs);
  const issues=MilestoneDashboardModel.teamIssueItems(data.issues);
  if(issues.length){
    const notice=el('div','guide-lead-attention');notice.append(el('strong','','확인할 사항'),el('span','',issues.map(item=>`${item.label} ${item.tasks.length}건`).join(' · ')),
      button('보기','guide-team-link',()=>{
        const {dialog,close}=openDialog('확인할 사항'),list=el('div','guide-dashboard-scroll');
        const issueColors=guideProjectColorScope(issues.flatMap(issue=>issue.tasks.map(task=>projects.find(project=>project.id===task.projectId)).filter(Boolean)));
        issues.forEach(({label,tasks})=>{list.appendChild(el('h3','',`${label} · ${tasks.length}건`));tasks.forEach(task=>{const item=guideDashboardTask(task,issueColors);item.onclick=()=>{close();if(canEditTask(task))openTaskEditor(task);else setView('projects',task.projectId);};list.appendChild(item);});});
        dialog.appendChild(list);
      }));right.appendChild(notice);
  }
  const content=el('div','guide-lead-content');right.appendChild(content);
  if(state.view==='team')renderGuideTeam(content,{state:state.team,scope,tasks:data.tasks,projectFilters:true,compactTools:true});
  else{
    const calendar=state.calendar;if(!calendar.month||(calendar.today!==today&&calendar.followToday))calendar.month=today.slice(0,7);calendar.today=today;
    guideDashboardSchedule(content,data.events,calendar,today,{majorOnly:true,label:'우리 팀 참여 프로젝트 주요 일정 달력',footnote:'우리 팀 업무가 등록된 프로젝트의 주요 일정만 표시합니다. 일반 실무 업무는 제외하며, 주요 일정은 마감일 기준으로 표시합니다.'});
  }
  if(state.view==='team'){layout.append(sidebar,right);main.appendChild(layout);}
  else main.appendChild(right);
}
