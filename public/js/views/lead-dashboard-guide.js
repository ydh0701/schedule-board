/* Lead dashboard: Chat mentions and related project major dates, not staff allocation. */
const guideLeadDashboardView={mentionTab:'direct',today:null,owner:null,
  calendar:{month:null,today:null,followToday:true,view:'calendar',query:'',project:'',platform:'',kind:'all',status:'all',sort:'start',fields:{project:true,title:true,dates:false}}};
function renderGuideLeadDashboard(main){
  const state=guideLeadDashboardView,today=dateKey(todayDate());
  if(state.owner!==currentUser.uid){state.owner=currentUser.uid;Object.assign(state.calendar,{month:null,today:null,followToday:true,view:'calendar',query:'',project:'',platform:''});}
  state.today=today;
  const scope=MilestonePersonalModel.viewers(activeUsers(),{...currentProfile,id:currentUser.uid},{team:true});
  const related=guideRelatedProjects().filter(project=>project.status!=='completed'),relatedIds=related.map(project=>project.id);
  const data=MilestoneDashboardModel.teamOverview(related,activeTasks().filter(task=>relatedIds.includes(task.projectId)),milestones,currentProfile.departmentId,today,scope.map(user=>user.id),relatedIds);
  const layout=el('div','guide-dashboard-layout guide-lead-dashboard'),sidebar=el('aside','guide-dashboard-sidebar'),right=el('section','guide-dashboard-calendar-panel');
  const mentions=el('section','guide-dashboard-panel guide-mentions-panel'),mentionHead=el('div','guide-dashboard-panel-head');
  mentionHead.append(el('h2','','Google Chat'),el('span','guide-chat-status','미연결'));mentions.appendChild(mentionHead);
  const mentionTabs=el('div','guide-page-tabs guide-mention-tabs');mentionTabs.setAttribute('role','tablist');mentionTabs.setAttribute('aria-label','멘션 대상');
  [['direct','나에게 온 멘션'],['all','@모두']].forEach(([id,label])=>{const tab=button(label,state.mentionTab===id?'active':'',()=>{state.mentionTab=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(id===state.mentionTab));mentionTabs.appendChild(tab);});
  mentions.appendChild(mentionTabs);
  const empty=el('div','guide-mention-connection');empty.append(el('strong','','아직 연결되지 않았습니다.'));
  mentions.appendChild(empty);sidebar.appendChild(mentions);
  const teamIssues=MilestoneTeamModel.issuesFor(data.tasks,today,scope.map(user=>user.id));
  const issues=MilestoneDashboardModel.teamIssueItems(data.issues);
  if(teamIssues.overlap.length)issues.push({id:'overlap',label:'프로젝트 간 일정 겹침',tasks:teamIssues.overlap});
  if(issues.length){
    const notice=el('div','guide-lead-attention');notice.append(el('strong','','확인할 사항'),el('span','',issues.map(item=>`${item.label} ${item.tasks.length}건`).join(' · ')),
      button('보기','guide-team-link',()=>{
        const {dialog,close}=openDialog('확인할 사항'),list=el('div','guide-dashboard-scroll');
        const issueColors=guideProjectColorScope(issues.flatMap(issue=>issue.tasks.map(task=>projects.find(project=>project.id===task.projectId)).filter(Boolean)));
        issues.forEach(({label,tasks})=>{list.appendChild(el('h3','',`${label} · ${tasks.length}건`));tasks.forEach(task=>{const item=guideDashboardTask(task,issueColors);item.onclick=()=>{close();openGuideTaskLocation(task);};list.appendChild(item);});});
        dialog.appendChild(list);
      }));right.appendChild(notice);
  }
  const content=el('div','guide-lead-content');right.appendChild(content);
  const calendar=state.calendar;if(!calendar.month||(calendar.today!==today&&calendar.followToday))calendar.month=today.slice(0,7);calendar.today=today;
  guideDashboardSchedule(content,data.events,calendar,today,{majorOnly:true,label:'우리 팀 참여 프로젝트 주요 일정 달력',footnote:'우리 팀 업무가 등록된 프로젝트의 주요 일정만 표시합니다. 일반 실무 업무는 제외하며, 주요 일정은 마감일 기준으로 표시합니다.'});
  layout.append(sidebar,right);main.appendChild(layout);
}
