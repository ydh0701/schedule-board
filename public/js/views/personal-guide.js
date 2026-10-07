/* Personal schedule. Existing task editor and permission/state layer remain authoritative. */
const guidePersonalView={owner:null,states:new Map()};
// Presentation-only palette. Guide color families; HEX values are screen approximations.
// Existing assignments survive view/order changes; new projects use free slots first.
const GUIDE_PROJECT_COLORS=[
  {color:'#0084ff',background:'#d4e5ff'},
  {color:'#ff9500',background:'#ffebcc'},
  {color:'#ff526b',background:'#ffe0e5'},
  {color:'#20b9ac',background:'#bfecea'},
  {color:'#9097a5',background:'#f0f1f4'},
  {color:'#24c66b',background:'#c9f3d9'}
];
const guideProjectColorRegistries=new Map();
function guideProjectColorRegistry(){
  const owner=typeof currentUser!=='undefined'&&currentUser?.uid||'anonymous';
  const environment=typeof location!=='undefined'&&location.pathname.startsWith('/tests/')?'fixture':'app';
  const key=`milestone.projectColors.v1:${environment}:${owner}`;
  if(!guideProjectColorRegistries.has(key)){
    let storage=null;try{storage=typeof localStorage!=='undefined'?localStorage:null;}catch(_){}
    guideProjectColorRegistries.set(key,MilestoneProjectColors.create({size:GUIDE_PROJECT_COLORS.length,storage,key}));
  }
  const registry=guideProjectColorRegistries.get(key);
  if(typeof projects!=='undefined')registry.reconcile(projects);
  return registry;
}
function guideProjectColorScope(order=[],registry=guideProjectColorRegistry()){
  const bindings=[];
  const palette=project=>GUIDE_PROJECT_COLORS[registry.slot(project)];
  const paint=(node,project)=>{const value=palette(project);node.style.setProperty('--project-color',value.color);node.style.setProperty('--project-background',value.background);};
  const scope={
    color:project=>palette(project).color,
    snapshot:()=>guideProjectColorScope([],registry),
    apply(node,project){bindings.push({node,project});paint(node,project);},
    release(root){for(let i=bindings.length-1;i>=0;i--)if(root.contains(bindings[i].node))bindings.splice(i,1);},
    setOrder(projectList){projectList.forEach(project=>palette(project));bindings.forEach(({node,project})=>paint(node,project));}
  };
  scope.setOrder(order);return scope;
}
function guidePersonalState(userId){
  if(!guidePersonalView.states.has(userId)) guidePersonalView.states.set(userId,{project:'',platform:'',status:'active',query:'',weeks:MilestonePersonalModel.DISPLAY_POLICY.defaultWeeks,expanded:new Set(),closed:new Set(),followToday:true});
  return MilestonePersonalModel.syncToday(guidePersonalView.states.get(userId),dateKey(todayDate()),dateKey(mondayOf(todayDate())));
}
function renderGuidePersonal(main){
  const allowed=MilestonePersonalModel.viewers(activeUsers(),{...currentProfile,id:currentUser.uid},{all:isAdmin()||isPM(),team:isLead()});
  if(!allowed.some(user=>user.id===guidePersonalView.owner)) guidePersonalView.owner=currentUser.uid;
  const owner=guidePersonalView.owner,state=guidePersonalState(owner);
  const all=MilestonePersonalModel.personalTasks(activeTasks(),projects,owner);
  const heading=el('div','guide-detail-heading guide-personal-heading');heading.appendChild(el('h2','',personName(owner)));
  if(allowed.length>1) heading.appendChild(guideSelect('일정 담당자',allowed.map(user=>[user.id,`${departmentName(user.departmentId)} · ${user.name}`]),owner,value=>{guidePersonalView.owner=value;rerender();}));
  main.appendChild(heading);
  const filters=el('div','guide-detail-filters'),period=el('div','guide-period'),target=el('div','guide-gantt-scroll guide-personal-scroll');
  const projectIds=new Set(all.map(task=>task.projectId));
  const refresh=()=>rerender();
  filters.append(guideSelect('프로젝트',[['','전체 프로젝트'],...projects.filter(project=>projectIds.has(project.id)).map(project=>[project.id,project.code||project.name])],state.project,value=>{state.project=value;refresh();}),
    guideSelect('플랫폼',[['','전체 플랫폼'],...[...new Set(all.map(task=>task.platform))].filter(Boolean).map(id=>[id,platformName(id)])],state.platform,value=>{state.platform=value;refresh();}),
    guideSelect('일정 상태',[['active','진행 중 · 예정'],['review','일정 재확인'],['all','완료 포함']],state.status,value=>{state.status=value;refresh();}),
    guideSearch('업무 검색',state.query,value=>{state.query=value;draw();}));
  function move(days){const date=localDate(state.start);date.setDate(date.getDate()+days);state.start=dateKey(date);state.followToday=false;refresh();}
  period.append(button('‹ 이전','ghost tiny',()=>move(-state.weeks*7)),button('오늘','ghost tiny',()=>{state.followToday=true;state.start=dateKey(mondayOf(todayDate()));refresh();}),button('다음 ›','ghost tiny',()=>move(state.weeks*7)),
    guideSelect('표시 기간',[[4,'4주'],[8,'8주'],[12,'12주']],String(state.weeks),value=>{state.weeks=Number(value);refresh();}));
  const end=localDate(state.start);end.setDate(end.getDate()+state.weeks*7-1);period.appendChild(el('span','guide-period-label',`${state.start} ~ ${dateKey(end)}`));
  const person=allowed.find(user=>user.id===owner)||currentProfile;
  if(canCreateTask(person.departmentId,owner)) period.appendChild(button('+ 업무 추가','primary tiny',()=>openTaskEditor(null,{projectId:state.project||all[0]?.projectId,platform:state.platform||undefined,departmentId:person.departmentId,assigneeId:owner})));
  const tools=el('div','guide-detail-tools');tools.append(filters,period);main.append(tools,target);
  function draw(){
    target.replaceChildren();
    const groups=MilestonePersonalModel.groups(all,projects,state,dateKey(todayDate()),state.expanded);
    const colors=guideProjectColorScope(groups.map(group=>group.project));
    if(!groups.length){const empty=el('div','guide-empty');empty.append(el('h3','',all.length?'조건에 맞는 업무가 없습니다.':'배정된 프로젝트 업무가 없습니다.'),el('p','','담당자로 지정되거나 지원 업무에 참여하면 여기에 표시됩니다.'));
      if(all.length) empty.appendChild(button('필터 초기화','ghost',()=>{Object.assign(state,{project:'',platform:'',status:'active',query:''});refresh();}));target.appendChild(empty);return;}
    const table=el('div','guide-gantt guide-personal-gantt');table.style.setProperty('--days',state.weeks*7);table.style.setProperty('--timeline-min',`${state.weeks*7*18}px`);
    table.appendChild(guideTimelineHeader(state,['업무명','기간','상태']));
    groups.filter(group=>group.scheduled.length).forEach(group=>{
      const closed=state.closed.has(group.key),row=el('div','guide-gantt-row guide-gantt-group');colors.apply(row,group.project);
      const toggle=button(`${closed?'›':'⌄'} ${group.project.code||group.project.name} · ${platformName(group.platform)} · ${group.scheduled.length}건`,'guide-group-toggle',()=>{closed?state.closed.delete(group.key):state.closed.add(group.key);draw();});toggle.setAttribute('aria-expanded',String(!closed));
      toggle.title=group.project.name;row.append(toggle,guideTimelineCell(null,state));table.appendChild(row);
      if(closed) return;
      group.visible.forEach(task=>{
        const row=el('div','guide-gantt-row'),info=el('div','guide-gantt-info');colors.apply(row,group.project);
        const title=button(task.title,'guide-task-title',()=>openTaskEditor(task));title.disabled=!canEditTask(task);title.title=task.title;
        const range=MilestoneProjectModel.taskDateRange(task.startDate,task.dueDate,dateKey(todayDate()));
        const status=MilestoneProjectModel.taskPresentation(task,dateKey(todayDate()));
        info.append(title,el('span','guide-task-period',range),el('span',`guide-status ${status.key}`,status.label));row.append(info,guideTimelineCell(task,state));table.appendChild(row);
      });
      if(group.scheduled.length>MilestonePersonalModel.DISPLAY_POLICY.previewLimit && !state.query && state.status==='active'){
        const row=el('div','guide-gantt-row guide-preview-row');row.append(button(group.expanded?'핵심 업무만 보기':`전체 펼치기 · ${group.scheduled.length-group.visible.length}건 더 보기`,'guide-group-toggle',()=>{group.expanded?state.expanded.delete(group.key):state.expanded.add(group.key);draw();}),guideTimelineCell(null,state));table.appendChild(row);
      }
    });
    if(groups.some(group=>group.scheduled.length)){target.appendChild(table);guideContinuousTodayLine(table,state);}
    else target.appendChild(el('p','guide-empty','날짜가 설정된 업무가 없습니다. 아래 일정 미정 업무에서 날짜를 설정할 수 있습니다.'));
    const undatedCount=groups.reduce((total,group)=>total+group.undated.length,0);
    if(undatedCount){
      const details=el('details','guide-personal-undated');details.open=Boolean(state.undatedExpanded||state.query.trim());details.ontoggle=()=>{state.undatedExpanded=details.open;};
      details.appendChild(el('summary','',`일정 미정 업무 · ${undatedCount}건`));
      groups.filter(group=>group.undated.length).forEach(group=>{
        const section=el('section','guide-undated-group');colors.apply(section,group.project);section.appendChild(el('h3','',`${group.project.code||group.project.name} · ${platformName(group.platform)} · ${group.undated.length}건`));
        group.undated.forEach(task=>{const row=el('div','guide-undated-row'),title=button(task.title,'guide-task-title',()=>openTaskEditor(task));title.disabled=!canEditTask(task);title.title=task.title;
          const status=MilestoneProjectModel.taskPresentation(task,dateKey(todayDate()));row.append(title,el('small','',task.startDate&&task.dueDate?'날짜 확인 필요':'일정 미정'),el('span',`guide-status ${status.key}`,status.label));section.appendChild(row);});details.appendChild(section);
      });target.appendChild(details);
    }
  }
  draw();
}
// Refresh today-following timelines after midnight or when returning to this tab.
function refreshGuidePersonalToday(){
  if(activeView!=='my-work'&&activeView!=='work') return;
  const state=guidePersonalView.states.get(guidePersonalView.owner);
  if(state && state.today!==dateKey(todayDate())) rerender();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden) refreshGuidePersonalToday();});
setInterval(refreshGuidePersonalToday,60000);
