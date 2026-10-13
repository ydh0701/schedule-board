/* Guide-based project screens. Editors and scheduling stay in the existing state layer. */
const guideProjectView={query:'',platform:'',list:'active',originProject:null,expanded:new Map(),detail:new Map()};
let guidePendingTaskId=null;
let guideTaskReturnView=null;
function openGuideTaskLocation(task){
  guideTaskReturnView=activeView;
  const project=projects.find(item=>item.id===task.projectId);if(!project)return openTaskDetails(task);
  const state=guideDetailState(project.id);Object.assign(state,{query:'',platform:'',department:'',assignee:'',stage:'',status:'all',followToday:false,start:task.startDate||dateKey(todayDate()),undatedExpanded:!task.startDate});
  state.closed.delete(task.departmentId);if(!state.expanded)state.expanded=new Set();state.expanded.add(task.departmentId);guidePendingTaskId=task.id;
  if(task.status==='done'){if(!state.completedExpanded)state.completedExpanded=new Set();state.completedExpanded.add(task.departmentId);}
  setView('projects',project.id);
}
function guideRoleName(project,id){return project.roleSnapshots?.find(role=>role.id===id)?.name || departmentName(id);}
function guideDetailState(projectId){
  if(!guideProjectView.detail.has(projectId)) guideProjectView.detail.set(projectId,{platform:'',department:'',assignee:'',stage:'',status:'all',query:'',weeks:4,followToday:true,closed:new Set()});
  return MilestoneProjectModel.syncToday(guideProjectView.detail.get(projectId),dateKey(todayDate()));
}
function guideSelect(label,options,value,onChange){
  const field=selectField(label,options);field.wrap.classList.add('guide-filter');field.select.value=value;
  const updateSelection=()=>field.wrap.classList.toggle('has-selection',field.select.value!==String(options[0]?.[0]??''));
  updateSelection();field.select.onchange=()=>{updateSelection();onChange(field.select.value);};return field.wrap;
}
function guideSearch(label,value,onChange){
  const wrap=el('label','guide-search');wrap.appendChild(milestoneIcon('search'));
  const input=document.createElement('input');input.type='search';input.placeholder=label;input.setAttribute('aria-label',label);input.value=value;
  input.oninput=()=>onChange(input.value);wrap.appendChild(input);return wrap;
}
function openGuideProjectDetail(project,stage=''){
  guideProjectView.originProject=project.id;selectedProjectId=project.id;
  const state=guideDetailState(project.id);state.stage=stage;
  state.platform=guideProjectView.platform&&(project.platforms||[]).includes(guideProjectView.platform)?guideProjectView.platform:'';
  if(projectIsCompleted(project))state.status='all';rerender();
}
function guideProjectTabs(main){
  const tabs=el('nav','guide-page-tabs');tabs.setAttribute('aria-label','프로젝트 보기');tabs.setAttribute('role','tablist');
  [['active','진행 프로젝트'],['completed','완료 프로젝트']].forEach(([id,label])=>{
    const tab=button(label,guideProjectView.list===id?'active':'',()=>{guideProjectView.list=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(guideProjectView.list===id));tabs.appendChild(tab);
  });main.appendChild(tabs);
}
function renderGuideProjects(main){
  if(selectedProjectId && !projects.some(project=>project.id===selectedProjectId)) selectedProjectId=null;
  if(selectedProjectId){
    const project=projects.find(project=>project.id===selectedProjectId);
    if(guideProjectView.originProject!==project.id){guideProjectView.list=projectIsCompleted(project)?'completed':'active';guideProjectView.originProject=project.id;}
    return renderGuideProjectDetail(main,project);
  }
  guideProjectTabs(main);
  const tools=el('div','guide-project-tools');
  const drawTarget=el('div','guide-project-list');
  const count=el('p','guide-result-count');
  tools.append(guideSearch('프로젝트명 · 코드 검색',guideProjectView.query,value=>{guideProjectView.query=value;draw();}),count);
  tools.insertBefore(guideSelect('프로젝트 플랫폼',[['','전체 플랫폼'],...PLATFORMS.map(item=>[item.id,item.name])],guideProjectView.platform,value=>{guideProjectView.platform=value;draw();}),count);
  if(canManageProjects()&&guideProjectView.list==='active') tools.append(button('+ 프로젝트 생성','primary',openProjectCreator));
  main.append(tools,drawTarget);
  const draw=()=>{
    drawTarget.replaceChildren();
    const matched=MilestoneProjectModel.filterProjects(projects,activeTasks(),guideProjectView);
    const completed=guideProjectView.list==='completed',label=completed?'완료 프로젝트':'진행 프로젝트';
    const active=matched.filter(project=>projectIsCompleted(project)===completed);
    count.textContent=`${label} ${active.length}개`;
    if(!active.length) {
      const empty=el('div','guide-empty');empty.append(el('h3','',completed?'표시할 완료 프로젝트가 없습니다.':projects.length?'조건에 맞는 진행 프로젝트가 없습니다.':'첫 프로젝트를 만들어주세요.'),el('p','',completed?'완료 처리된 프로젝트를 이곳에서 확인할 수 있습니다. 검색어와 플랫폼 조건도 확인해주세요.':projects.length?'검색어와 플랫폼 조건을 확인해주세요.':'플랫폼과 직군별 담당자를 선택하면 기본 단계와 업무를 생성합니다.'));
      if(guideProjectView.query||guideProjectView.platform)empty.appendChild(button('필터 초기화','ghost',()=>{Object.assign(guideProjectView,{query:'',platform:''});rerender();}));
      if(!completed&&!projects.length && canManageProjects()) empty.appendChild(button('프로젝트 생성','primary',openProjectCreator));drawTarget.appendChild(empty);
    }
    active.sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name),undefined,{numeric:true})).forEach((project,index)=>drawTarget.appendChild(guideProjectCard(project,index===0)));
  };draw();
}
function guideProjectCard(project,defaultExpanded){
  const card=el('article','guide-project-card');
  const items=tasksForProject(project.id);
  const stages=MilestoneProjectModel.stageSummary(project,items);
  const expanded=guideProjectView.expanded.has(project.id)?guideProjectView.expanded.get(project.id):defaultExpanded;
  const head=el('div','guide-project-card-head');
  const toggle=button('','guide-project-toggle',()=>{guideProjectView.expanded.set(project.id,!expanded);rerender();});toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-label',`${project.code||project.name} 단계 ${expanded?'접기':'펼치기'}`);
  toggle.append(el('strong','',project.code||project.name),el('span','guide-project-name',project.code?project.name:''));
  const platforms=el('span','guide-platforms',(project.platforms||[]).map(platformName).join(' / '));toggle.appendChild(platforms);
  toggle.appendChild(el('span','guide-chevron',expanded?'⌃':'⌄'));head.appendChild(toggle);
  head.appendChild(button('세부 일정 보기 →','ghost tiny guide-project-detail-link',()=>openGuideProjectDetail(project)));
  card.appendChild(head);
  if(expanded){
    const track=el('ol','guide-stage-track');
    stages.forEach((stage,index)=>{
      const item=el('li',`guide-stage ${stage.state}`);
      const select=button('','guide-stage-button',()=>openGuideProjectDetail(project));
      select.append(el('span','guide-stage-title',stage.name),el('span','guide-stage-dot',stage.state==='done'?'✓':stage.code||String(index+1)),el('span','guide-stage-meta',`${stage.done}/${stage.total} 완료`));
      select.title='프로젝트 세부 일정 보기';item.appendChild(select);track.appendChild(item);
    });card.appendChild(track);
  }
  return card;
}
// Shared project/personal schedule folds: completed above, three active rows, extra below.
function guideAppendSchedulePreview(table,group,state,key,appendTask){
  if(!state.completedExpanded)state.completedExpanded=new Set();
  if(group.completed.length){
    const opened=group.full||state.completedExpanded.has(key),row=el('div','guide-gantt-row guide-preview-row');
    const toggle=button(`${opened?'⌄':'›'} 완료 · ${group.completed.length}건`,'guide-group-toggle',()=>{state.completedExpanded.has(key)?state.completedExpanded.delete(key):state.completedExpanded.add(key);rerender();});toggle.setAttribute('aria-expanded',String(opened));
    row.append(toggle,guideTimelineCell(null,state));table.appendChild(row);if(opened)group.completed.forEach(appendTask);
  }
  (group.full?group.active:group.active.slice(0,MilestoneProjectModel.DETAIL_DISPLAY_POLICY.previewLimit)).forEach(appendTask);
  if(!group.full&&group.remaining.length){
    const opened=state.expanded.has(key),row=el('div','guide-gantt-row guide-preview-row'),label=group.remaining.some(task=>task.status==='in_progress')?'진행 중·대기':'대기';
    const toggle=button(`${opened?'⌄':'›'} ${label} · ${group.remaining.length}건`,'guide-group-toggle',()=>{opened?state.expanded.delete(key):state.expanded.add(key);rerender();});toggle.setAttribute('aria-expanded',String(opened));
    row.append(toggle,guideTimelineCell(null,state));table.appendChild(row);if(opened)group.remaining.forEach(appendTask);
  }
}
function renderGuideProjectDetail(main,project){
  const state=guideDetailState(project.id),all=tasksForProject(project.id);
  if(!state.expanded)state.expanded=new Set();
  if(!state.completedExpanded)state.completedExpanded=new Set();
  const header=el('div','guide-detail-heading guide-project-detail-heading');header.append(el('h2','',project.name),el('span','guide-project-code',`${project.code||''}${projectIsCompleted(project)?' · 완료 프로젝트':''}`));
  if(guideTaskReturnView&&guideTaskReturnView!=='projects')header.prepend(button('‹ 이전 화면','ghost tiny',()=>{const view=guideTaskReturnView;guideTaskReturnView=null;setView(view);}));
  if(canManageProjects()) header.appendChild(button('프로젝트 설정','ghost tiny',()=>openProjectEditor(project)));main.appendChild(header);
  const actions=el('div','guide-inline-actions');
  actions.appendChild(button('주요 일정','ghost tiny',()=>{const {dialog}=openDialog('프로젝트 주요 일정');renderProjectMilestoneList(dialog,project);}));
  if(canManageProjects()) actions.appendChild(button(project.status==='completed'?'프로젝트 재개':'프로젝트 완료','ghost tiny',async()=>{
    if(!confirm(project.status==='completed'?'이 프로젝트를 다시 진행할까요?':'모든 업무를 확인했나요? 프로젝트를 완료 처리합니다.')) return;
    try {project.status==='completed'?await reopenProject(project.id):await completeProject(project.id);showToast('프로젝트 상태를 변경했습니다.');}
    catch(error){showToast(error.message,'error');}
  }));header.appendChild(actions);
  const tools=el('div','guide-detail-tools guide-project-detail-tools'),filters=el('div','guide-detail-filters'),secondary=el('div','guide-detail-filters guide-detail-secondary-filters'),period=el('div','guide-period');
  const refresh=()=>rerender();
  if((project.platforms||[]).length>1)secondary.appendChild(guideSelect('플랫폼',[['','전체 플랫폼'],...(project.platforms||[]).map(id=>[id,platformName(id)])],state.platform,value=>{state.platform=value;refresh();}));
  filters.append(guideSelect('직군',[['','전체 직군'],...[...new Set(all.map(t=>t.departmentId))].map(id=>[id,guideRoleName(project,id)])],state.department,value=>{state.department=value;refresh();}));
  secondary.appendChild(guideSelect('담당자',[['','전체 담당자'],...[...new Set(all.flatMap(t=>[t.assigneeId,...(t.assigneeIds||[]),...(t.assignees||[]).map(item=>item.userId)]).filter(Boolean))].map(id=>[id,userName(id)])],state.assignee,value=>{state.assignee=value;refresh();}));
  secondary.appendChild(guideSelect('일정 상태',[['active','진행 중 · 예정'],['review','일정 재확인'],['all','완료 포함']],state.status,value=>{state.status=value;refresh();}));
  const search=guideSearch('업무 검색',state.query,value=>{state.query=value;draw();});filters.prepend(search);
  if(project.stageSnapshots?.length) secondary.appendChild(guideSelect('단계',[['','전체 단계'],...project.stageSnapshots.map(s=>[s.id,s.name])],state.stage,value=>{state.stage=value;refresh();}));
  function move(days){const date=localDate(state.start);date.setDate(date.getDate()+days);state.start=dateKey(date);state.followToday=false;refresh();}
  period.append(button('‹ 이전','ghost tiny',()=>move(-state.weeks*7)),button('오늘','ghost tiny',()=>{state.start=dateKey(todayDate());state.followToday=true;refresh();}),button('다음 ›','ghost tiny',()=>move(state.weeks*7)),
    guideSelect('표시 기간',[[4,'4주'],[8,'8주'],[12,'12주']],String(state.weeks),value=>{state.weeks=Number(value);refresh();}));
  const end=localDate(state.start);end.setDate(end.getDate()+state.weeks*7-1);period.appendChild(el('span','guide-period-label',`${state.start} ~ ${dateKey(end)}`));
  if(canManageProjects()) period.appendChild(button('+ 업무 추가','primary tiny',()=>openTaskEditor(null,{projectId:project.id,platform:state.platform||project.platforms?.[0]})));
  const extra=el('details','guide-extra-filters');extra.open=Boolean(state.filtersExpanded);
  const fitFilterPanel=()=>{if(!extra.open||!extra.isConnected)return;extra.style.setProperty('--filter-panel-shift','0px');const rect=secondary.getBoundingClientRect(),shift=rect.right>window.innerWidth-16?window.innerWidth-16-rect.right:rect.left<16?16-rect.left:0;extra.style.setProperty('--filter-panel-shift',shift+'px');};
  extra.ontoggle=()=>{state.filtersExpanded=extra.open;if(extra.open)requestAnimationFrame(fitFilterPanel);};
  const applied=[state.platform?platformName(state.platform):'',state.assignee?userName(state.assignee):'',state.stage?project.stageSnapshots?.find(item=>item.id===state.stage)?.name:'',state.status==='all'?'완료 포함':state.status==='review'?'일정 재확인':''].filter(Boolean);
  extra.append(el('summary','',`필터${applied.length?' · '+applied.join(' · '):''}`),secondary);filters.appendChild(extra);
  if(state.platform||state.assignee||state.stage||state.department||state.query||state.status!=='all')filters.appendChild(button('초기화','ghost tiny',()=>{Object.assign(state,{platform:'',assignee:'',stage:'',department:'',query:'',status:'all'});refresh();}));
  tools.append(filters,period);main.appendChild(tools);
  const target=el('div','guide-gantt-scroll guide-outside-weeks');main.appendChild(target);
  const draw=()=>{
    target.replaceChildren();
    const filtered=MilestoneProjectModel.filterTasks(all,state);
    if(!filtered.length){const empty=el('div','guide-empty');empty.append(el('h3','','표시할 업무가 없습니다.'),button('필터 초기화','ghost',()=>{Object.assign(state,{platform:'',department:'',assignee:'',stage:'',status:projectIsCompleted(project)?'all':'active',query:''});refresh();}));target.appendChild(empty);return;}
    const table=el('div','guide-gantt guide-project-detail-gantt');table.style.setProperty('--days',state.weeks*7);table.style.setProperty('--timeline-min',`${state.weeks*7*18}px`);
    table.appendChild(guideTimelineHeader(state,['업무명','담당자','기간','상태'],true));
    const roleOrder=new Map((project.roleSnapshots||[]).map(role=>[role.id,Number(role.order||0)]));
    const topRoles=new Map([['video_partner',0],['business',1]]);
    const groups=MilestoneProjectModel.detailGroups(filtered,state,dateKey(todayDate()),state.expanded).sort((a,b)=>(topRoles.get(a.id)??2)-(topRoles.get(b.id)??2)||(roleOrder.get(a.id)??999)-(roleOrder.get(b.id)??999));
    groups.filter(group=>group.scheduled.length).forEach(group=>{
      const id=group.id;
      const closed=state.closed.has(id),row=el('div','guide-gantt-row guide-gantt-group');
      const toggle=button(`${closed?'›':'⌄'} ${guideRoleName(project,id)} · ${group.scheduled.length}건`,'guide-group-toggle',()=>{closed?state.closed.delete(id):state.closed.add(id);draw();});toggle.setAttribute('aria-expanded',String(!closed));
      const timeline=guideTimelineCell(null,state);row.append(toggle,timeline);table.appendChild(row);
      const appendTask=task=>{
        const row=el('div','guide-gantt-row'),info=el('div','guide-gantt-info');row.dataset.taskId=task.id;
        const taskName=button(task.title,'guide-task-title',()=>openTaskEditor(task));taskName.dataset.focusTask=task.id;taskName.title=task.title;
        const range=MilestoneProjectModel.taskDateRange(task.startDate,task.dueDate,dateKey(todayDate()));
        const status=MilestoneProjectModel.taskPresentation(task,dateKey(todayDate()));
        info.append(taskName,el('span','guide-assignee',taskAssigneeName(task)),el('span','guide-task-period',range),el('span',`guide-status ${status.key}`,status.label));
        row.append(info,guideTimelineCell(task,state));table.appendChild(row);
      };
      if(!closed)guideAppendSchedulePreview(table,group,state,id,appendTask);
    });
    if(groups.some(group=>group.scheduled.length)){target.appendChild(table);}
    else target.appendChild(el('p','guide-empty','날짜가 설정된 업무가 없습니다. 아래 일정 미정 업무를 확인해주세요.'));
    const undatedCount=groups.reduce((total,group)=>total+group.undated.length,0);
    if(undatedCount){
      const details=el('details','guide-personal-undated');details.open=Boolean(state.undatedExpanded||state.query.trim());details.ontoggle=()=>state.undatedExpanded=details.open;details.appendChild(el('summary','',`일정 미정 업무 · ${undatedCount}건`));
      groups.filter(group=>group.undated.length).forEach(group=>{const section=el('section','guide-undated-group');section.appendChild(el('h3','',`${guideRoleName(project,group.id)} · ${group.undated.length}건`));
        group.undated.forEach(task=>{const row=el('div','guide-undated-row'),title=button(`${task.title} · ${taskAssigneeName(task)}`,'guide-task-title',()=>openTaskEditor(task));row.dataset.taskId=task.id;title.dataset.focusTask=task.id;const status=MilestoneProjectModel.taskPresentation(task,dateKey(todayDate()));row.append(title,el('small','',task.startDate&&task.dueDate?'날짜 확인 필요':'일정 미정'),el('span',`guide-status ${status.key}`,status.label));section.appendChild(row);});details.appendChild(section);});target.appendChild(details);
    }
  };draw();if(extra.open)requestAnimationFrame(fitFilterPanel);
}
function guideTimelineCell(task,state){
  const cell=el('div','guide-timeline-cell');
  const days=state.weeks*7;
  for(let i=0;i<days;i++){
    const date=localDate(state.start);date.setDate(date.getDate()+i);
    if(date.getDay()===0||date.getDay()===6||isHoliday(date)){const shade=el('span','guide-weekend');shade.style.left=`${i/days*100}%`;shade.style.width=`${100/days}%`;cell.appendChild(shade);}
  }
  const position=task&&MilestoneProjectModel.timelinePosition(task,state.start,days);
  if(position){const bar=button(task.startDate<state.start?'‹':'','guide-timeline-bar '+(task.status==='done'?'done':task.scheduleReview?'review':''),()=>openTaskEditor(task));bar.dataset.focusTask=task.id;bar.style.left=`${position.left}%`;bar.style.width=`${position.width}%`;bar.setAttribute('aria-label',`${task.title} ${task.startDate}부터 ${task.dueDate}까지`);bar.title=`${task.title} · ${task.startDate} ~ ${task.dueDate}`;cell.appendChild(bar);}
  return cell;
}
function guideTimelineHeader(state,labels,separateWeeks=false){
  const row=el('div','guide-gantt-head guide-gantt-row'),info=el('div','guide-gantt-info'),dates=el('div','guide-gantt-dates');
  const weeks=separateWeeks?el('div','guide-gantt-weeks-outside'):dates;
  labels.forEach(label=>info.appendChild(el('strong','',label)));
  for(let week=0;week<state.weeks;week++){
    const from=localDate(state.start);from.setDate(from.getDate()+week*7);const until=new Date(from);until.setDate(until.getDate()+6);
    weeks.appendChild(el('strong','guide-gantt-week',`${from.getMonth()+1}/${from.getDate()} ~ ${until.getMonth()+1}/${until.getDate()}`));
  }
  const days=el('div','guide-gantt-days');
  for(let i=0;i<state.weeks*7;i++){
    const date=localDate(state.start);date.setDate(date.getDate()+i);
    const cell=el('span',date.getDay()===0||isHoliday(date)?'sunday':date.getDay()===6?'saturday':'');cell.append(el('b','',String(date.getDate())),el('small','',['일','월','화','수','목','금','토'][date.getDay()]));cell.title=dateKey(date)+(isHoliday(date)?' 공휴일':'');
    if(dateKey(date)===dateKey(todayDate())){cell.classList.add('guide-today-date');cell.setAttribute('aria-current','date');cell.setAttribute('aria-label',`${dateKey(date)} 오늘`);cell.title+=' · 오늘';}
    days.appendChild(cell);
  }
  dates.appendChild(days);row.append(info,dates);
  if(!separateWeeks)return row;
  const header=el('div','guide-gantt-header-stack'),ribbon=el('div','guide-gantt-row guide-gantt-week-ribbon');
  ribbon.append(el('div','guide-gantt-week-spacer'),weeks);header.append(ribbon,row);return header;
}
function refreshGuideProjectToday(){
  if(activeView!=='projects'||!selectedProjectId)return;
  const state=guideProjectView.detail.get(selectedProjectId);
  if(state&&state.today!==dateKey(todayDate()))rerender();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshGuideProjectToday();});
setInterval(refreshGuideProjectToday,60000);
