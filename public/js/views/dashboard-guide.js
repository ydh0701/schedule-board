/* Personal dashboard: summaries and calendar share the existing task/project records. */
const guideDashboardView={month:null,today:null,followToday:true,projectsExpanded:false,undatedExpanded:false,view:'calendar',timelineStart:null,query:'',project:'',platform:'',kind:'all',status:'all',sort:'start',fields:{project:true,title:true,dates:false}};
function openGuideMyWork(full=false){guidePersonalView.owner=currentUser.uid;Object.assign(guidePersonalState(currentUser.uid),{project:'',platform:'',status:full===true?'all':'active',query:''});setView('my-work');}
function guideDashboardTask(task,colors=guideProjectColorScope()){
  const item=button('','guide-dashboard-task',()=>canEditTask(task)?openTaskEditor(task):openGuideMyWork());
  const today=dateKey(todayDate());
  const status=MilestoneProjectModel.taskPresentation(task,today);
  const project=projects.find(project=>project.id===task.projectId);if(project)colors.apply(item,project);
  const meta=el('div','guide-dashboard-task-meta');meta.append(el('span','guide-dashboard-project-label',`${projectCode(task)} ${platformName(task.platform)}`),el('small',`guide-dashboard-status ${status.key}`,status.label));
  const detail=el('div','guide-dashboard-task-detail');detail.append(el('strong','',task.title),el('small','',MilestoneDashboardModel.shortDates(task.startDate,task.dueDate,today)));
  item.append(meta,detail);return item;
}
function openGuideDashboardMilestone(projectList){
  if(!canManageProjects())return;
  const {dialog,close}=openDialog('주요 일정 추가 · 프로젝트 선택');
  projectList.forEach(project=>dialog.appendChild(button(`${project.code||''} ${project.name}`,'ghost',()=>{close();openMilestoneEditor(null,project.id);}))); 
  if(!projectList.length)dialog.appendChild(el('p','','주요 일정을 추가할 프로젝트가 없습니다.'));
}
function renderGuideDashboard(main){
  if(!workDataReadiness.tasks){main.appendChild(el('p','guide-empty','업무 데이터를 불러오는 중입니다.'));return;}
  if(isLead()){renderGuideLeadDashboard(main);return;}
  const today=dateKey(todayDate()),state=guideDashboardView;
  if(!state.month || (state.today!==today&&state.followToday))state.month=today.slice(0,7);
  if(!state.timelineStart || (state.today!==today&&state.followToday))state.timelineStart=today.slice(0,4)+'-01';state.today=today;
  const tabs=el('div','guide-page-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','대시보드 보기');
  [['calendar','캘린더'],['timeline','타임라인']].forEach(([id,label])=>{const tab=button(label,state.view===id?'active':'',()=>{state.view=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.view===id));tabs.appendChild(tab);});main.appendChild(tabs);
  if(isPM()||isAdmin()){
    const notice=el('div','guide-dashboard-role-note');notice.append(el('span','','현재는 내 업무 대시보드입니다. 팀장 계정은 팀 배치와 받은 멘션 영역을 표시합니다.'),button('팀별 현황 보기','ghost tiny',()=>setView('people')));main.appendChild(notice);
  }
  const own=MilestonePersonalModel.personalTasks(activeTasks(),projects,currentUser.uid);
  const events=MilestoneDashboardModel.events(projects,own,milestones,activeTasks());
  const colors=guideProjectColorScope(events.map(event=>event.project));
  const layout=el('div','guide-dashboard-layout'),sidebar=el('aside','guide-dashboard-sidebar'),calendar=el('section','guide-dashboard-calendar-panel');
  const major=el('section','guide-dashboard-panel guide-dashboard-major');major.appendChild(el('h2','','주요 일정'));
  const majorItems=MilestoneDashboardModel.upcomingMajorEvents(events,today);
  const majorList=el('div','guide-dashboard-scroll');
  majorItems.forEach(event=>{const item=button('','guide-dashboard-task',()=>{setView('projects',event.project.id);});colors.apply(item,event.project);const meta=el('div','guide-dashboard-task-meta');meta.appendChild(el('span','guide-dashboard-project-label',`${event.project.code||event.project.name}${event.task?.platform?' '+platformName(event.task.platform):''}`));const detail=el('div','guide-dashboard-task-detail');detail.append(el('strong','',event.title),el('small','',MilestoneDashboardModel.shortDates(event.startDate,event.dueDate,today)));item.append(meta,detail);majorList.appendChild(item);});
  if(!majorItems.length)majorList.appendChild(el('p','guide-dashboard-empty','참여 프로젝트에 등록된 예정 주요 일정이 없습니다.'));
  major.appendChild(majorList);
  if(canManageProjects()){const footer=el('div','guide-dashboard-major-footer');const add=button('+','guide-dashboard-add',()=>openGuideDashboardMilestone(projects.filter(project=>!['archived','completed'].includes(project.status))));add.setAttribute('aria-label','주요 일정 추가');footer.appendChild(add);major.appendChild(footer);}sidebar.appendChild(major);
  const work=el('section','guide-dashboard-panel');const workHead=el('div','guide-dashboard-panel-head');workHead.append(el('h2','','내 업무'),button('개인 일정 ›','guide-team-link',openGuideMyWork));work.appendChild(workHead);
  const summary=MilestoneDashboardModel.summary(own,today),workList=el('div','guide-dashboard-scroll guide-dashboard-work-scroll');
  [['attention','확인이 필요한 업무'],['current','오늘 업무'],['next','다음 업무']].forEach(([key,label])=>{
    if(!summary[key].length)return;workList.appendChild(el('h3','',`${label} · ${summary[key].length}건`));
    summary[key].slice(0,MilestoneDashboardModel.DISPLAY_POLICY.summaryLimit).forEach(task=>workList.appendChild(guideDashboardTask(task,colors)));
    if(summary[key].length>MilestoneDashboardModel.DISPLAY_POLICY.summaryLimit)workList.appendChild(button(`나머지 ${summary[key].length-MilestoneDashboardModel.DISPLAY_POLICY.summaryLimit}건 확인`,'guide-team-link',()=>openGuideMyWork(true)));
  });if(!Object.values(summary).some(items=>items.length))workList.appendChild(el('p','guide-dashboard-empty','오늘 표시할 업무가 없습니다.'));work.appendChild(workList);
  if(summary.undated.length){const undated=el('details','guide-dashboard-undated');undated.open=state.undatedExpanded;undated.ontoggle=()=>state.undatedExpanded=undated.open;undated.appendChild(el('summary','',`일정 미정 업무 · ${summary.undated.length}건`));const list=el('div','guide-dashboard-scroll');summary.undated.forEach(task=>list.appendChild(guideDashboardTask(task,colors)));undated.appendChild(list);work.appendChild(undated);}sidebar.appendChild(work);
  const participation=el('details','guide-dashboard-panel guide-dashboard-projects');participation.open=state.projectsExpanded;participation.ontoggle=()=>{state.projectsExpanded=participation.open;};participation.appendChild(el('summary','','참여 프로젝트'));
  const participating=MilestoneDashboardModel.participation(projects,own);
  participating.forEach(item=>{
    const card=el('article','guide-dashboard-project');card.appendChild(button(`${item.project.code||''} ${item.project.name}`,'guide-team-link',()=>setView('projects',item.project.id)));
    item.platforms.forEach(platform=>{card.append(el('p','',`${platformName(platform.platform)} · ${platform.stage}`),el('small','',`내 업무 완료 ${platform.done}/${platform.total} · ${platform.progress}%`),progressBlock(platform.progress));});participation.appendChild(card);
  });if(!participating.length)participation.appendChild(el('p','guide-dashboard-empty','참여 중인 프로젝트가 없습니다.'));sidebar.appendChild(participation);
  if(state.view==='timeline'){main.appendChild(calendar);guideDashboardSchedule(calendar,events,state,today,{colors});return;}
  guideDashboardSchedule(calendar,events,state,today,{colors});
  layout.append(sidebar,calendar);main.appendChild(layout);
}
function guideDashboardSchedule(calendar,allEvents,state,today,options={}){
  const colors=options.colors||guideProjectColorScope();
  const controls=el('div','guide-dashboard-month-controls'),content=el('div','guide-dashboard-schedule-content');
  function move(offset){const key=state.view==='timeline'?'timelineStart':'month',date=localDate(state[key]+'-01');date.setMonth(date.getMonth()+offset*(state.view==='timeline'?MilestoneDashboardModel.VIEW_OPTIONS.timelineMoveMonths:1));state[key]=dateKey(date).slice(0,7);state.followToday=false;rerender();}
  const previous=button('‹','guide-dashboard-month-arrow',()=>move(-1)),next=button('›','guide-dashboard-month-arrow',()=>move(1));previous.setAttribute('aria-label','이전 기간');next.setAttribute('aria-label','다음 기간');
  const heading=el('h2','');controls.append(button('오늘','guide-dashboard-today',()=>{state.month=today.slice(0,7);state.timelineStart=today.slice(0,4)+'-01';state.followToday=true;rerender();}),previous,next,heading);
  const tools=el('div','guide-dashboard-tools');
  const search=guideSearch('일정 검색',state.query,value=>{state.query=value;draw();});
  const searchGroup=el('div','guide-dashboard-search-group'),applied=el('div','guide-dashboard-filter-note');applied.setAttribute('aria-live','polite');searchGroup.append(search,applied);
  tools.append(searchGroup,button('필터','guide-dashboard-tool',()=>openGuideDashboardTools('filter',allEvents,state,options,tools)),button('정렬','guide-dashboard-tool',()=>openGuideDashboardTools('sort',allEvents,state,options,tools)),button('표시 항목','guide-dashboard-tool',()=>openGuideDashboardTools('fields',allEvents,state,options,tools)));
  controls.appendChild(tools);calendar.append(controls,content);
  function draw(){
  colors.release(content);content.replaceChildren();const events=MilestoneDashboardModel.filterEvents(allEvents,state);
  const filtered=Boolean(state.project||state.platform||state.kind!=='all'||state.status!=='all'||state.query);
  applied.replaceChildren();applied.hidden=!filtered;
  if(filtered)applied.append(el('span','',`결과 ${events.length}건`),button('조건 초기화','guide-team-link',()=>{Object.assign(state,{query:'',project:'',platform:'',kind:'all',status:'all'});rerender();}));
  if(state.view==='timeline'){const data=MilestoneDashboardModel.timeline(events,state.timelineStart,MilestoneDashboardModel.VIEW_OPTIONS.timelineMonths,state.sort);colors.setOrder(data.rows.map(row=>row.project));heading.textContent=`${data.months[0].replace('-','년 ')}월 ~ ${data.months.at(-1).replace('-','년 ')}월`;renderGuideDashboardTimeline(content,data,state,today,colors);return;}
  heading.textContent=`${state.month.slice(0,4)}년 ${Number(state.month.slice(5))}월`;
  const grid=el('div','guide-dashboard-calendar');grid.setAttribute('aria-label',options.label||'내 업무와 참여 프로젝트 주요 일정 달력');
  const weekday=el('div','guide-dashboard-weekdays');['일','월','화','수','목','금','토'].forEach(label=>weekday.appendChild(el('strong','',label)));grid.appendChild(weekday);
  const weeks=MilestoneDashboardModel.calendarWeeks(events,state.month,state.sort);
  colors.setOrder(weeks.flatMap(week=>week.segments.filter(event=>event.lane<MilestoneDashboardModel.DISPLAY_POLICY.calendarLanes).map(event=>event.project)));
  weeks.forEach(week=>{
    const row=el('div','guide-dashboard-week'),days=el('div','guide-dashboard-days'),bars=el('div','guide-dashboard-events');
    week.days.forEach(date=>{
      const items=events.filter(event=>event.startDate<=date&&event.dueDate>=date);
      const day=button(String(Number(date.slice(8))),'guide-dashboard-day'+(date.slice(0,7)!==state.month?' outside':'')+(date===today?' today':''),()=>{
        const {dialog,close}=openDialog(`${date} 일정`);if(!items.length)dialog.appendChild(el('p','','등록된 일정이 없습니다.'));
        const dayColors=colors.snapshot();
        items.forEach(event=>{if(event.kind==='task'){const item=guideDashboardTask(event.task,dayColors);item.onclick=()=>{close();canEditTask(event.task)?openTaskEditor(event.task):openGuideMyWork();};dialog.appendChild(item);}else dialog.appendChild(button(`${event.project.code||event.project.name} · ${event.title}`,'ghost',()=>{close();setView('projects',event.project.id);}));});
      });day.setAttribute('aria-label',`${date} 일정 ${items.length}건`);days.appendChild(day);
    });
    week.segments.filter(event=>event.lane<MilestoneDashboardModel.DISPLAY_POLICY.calendarLanes).forEach(event=>{
      const bar=button('','guide-dashboard-event',()=>event.kind==='task'&&canEditTask(event.task)?openTaskEditor(event.task):setView('projects',event.project.id));
      bar.style.gridColumn=`${event.column+1} / span ${event.span}`;bar.style.gridRow=String(event.lane+1);colors.apply(bar,event.project);
      if(state.fields.project)bar.appendChild(el('strong','',event.project.code||event.project.name));if(state.fields.title)bar.appendChild(el('small','',event.title));if(state.fields.dates)bar.appendChild(el('small','',MilestoneDashboardModel.shortDates(event.startDate,event.dueDate,today)));bar.title=`${event.title} · ${event.startDate} ~ ${event.dueDate}`;bar.setAttribute('aria-label',`${event.project.code||event.project.name} ${event.title} ${event.startDate}부터 ${event.dueDate}까지`);bars.appendChild(bar);
    });
    const hidden=week.segments.filter(event=>event.lane>=MilestoneDashboardModel.DISPLAY_POLICY.calendarLanes);
    if(hidden.length){const more=el('div','guide-dashboard-more');more.textContent=`겹치는 일정 ${hidden.length}건 더 있음 · 날짜를 눌러 전체 확인`;bars.appendChild(more);}
    row.append(days,bars);grid.appendChild(row);
  });grid.classList.toggle('show-dates',state.fields.dates);content.append(grid,el('p','guide-footnote',options.footnote||'내 업무 기간과 참여 프로젝트의 등록된 주요 일정을 함께 표시합니다. 날짜를 누르면 겹치는 일정 전체를 확인할 수 있습니다.'));
  }draw();
}
function openGuideDashboardTools(mode,events,state,displayOptions={},anchor){
  const {dialog,close}=openDialog({filter:'일정 필터',sort:'일정 정렬',fields:'표시 항목'}[mode]),form=el('div','form-grid'),draft={...state,fields:{...state.fields}};
  const options=MilestoneDashboardModel.VIEW_OPTIONS;
  if(mode==='filter'){
    const projectMap=new Map(events.map(event=>[event.project.id,event.project]));
    form.append(guideSelect('일정 프로젝트',[['','전체 프로젝트'],...[...projectMap.values()].map(project=>[project.id,project.code||project.name])],draft.project,value=>draft.project=value),
      guideSelect('일정 플랫폼',[['','전체 플랫폼'],...PLATFORMS.map(platform=>[platform.id,platform.name])],draft.platform,value=>draft.platform=value),
      guideSelect('완료 여부',options.statuses,draft.status,value=>draft.status=value));
    if(!displayOptions.majorOnly)form.appendChild(guideSelect('일정 종류',options.kinds,draft.kind,value=>draft.kind=value));
    form.appendChild(el('p','guide-footnote','플랫폼 미지정 공통 일정은 전체 플랫폼에서 확인할 수 있습니다.'));
  }else if(mode==='sort')form.appendChild(guideSelect('일정 정렬 기준',options.sorts,draft.sort,value=>draft.sort=value));
  else options.fields.forEach(([id,label])=>{const wrap=el('label','guide-dashboard-field'),input=document.createElement('input');input.type='checkbox';input.checked=draft.fields[id];input.onchange=()=>draft.fields[id]=input.checked;wrap.append(input,el('span','',label));form.appendChild(wrap);});
  form.appendChild(button('적용','primary',()=>{if(mode==='fields'&&!Object.values(draft.fields).some(Boolean)){alert('최소 한 가지 표시 항목을 선택해 주세요.');return;}if(mode==='filter')Object.assign(state,{project:draft.project,platform:draft.platform,kind:draft.kind,status:draft.status});else if(mode==='sort')state.sort=draft.sort;else state.fields=draft.fields;close();rerender();}));mountDialogForm(dialog,form);
  if(anchor)positionGuidePopover(dialog,anchor);
}
function renderGuideDashboardTimeline(content,data,state,today,colors=guideProjectColorScope(data.rows.map(row=>row.project))){
  const scroll=el('div','guide-dashboard-timeline-scroll'),timeline=el('div','guide-dashboard-timeline');timeline.style.setProperty('--months',data.months.length);
  const months=el('div','guide-dashboard-timeline-months');data.columns.forEach(column=>{const label=el('span','',`${column.month.slice(2,4)}년 ${Number(column.month.slice(5))}월`);label.style.width=`${column.width}%`;months.appendChild(label);const line=el('div','guide-dashboard-month-line');line.style.left=`${column.left}%`;timeline.appendChild(line);});timeline.appendChild(months);
  const markerRow=el('div','guide-dashboard-timeline-markers');markerRow.setAttribute('aria-label','등록된 주요 날짜');
  const markerNodes=data.markers.map(marker=>{const label=marker.events.length===1?`${marker.events[0].project.code||marker.events[0].project.name} ${marker.events[0].title}`:`주요 일정 ${marker.events.length}건`;
    const item=button(`${marker.date.slice(5).replace('-','/')} · ${label}`,'guide-dashboard-date-marker',()=>{const {dialog,close}=openDialog(`${marker.date} 주요 일정`);marker.events.forEach(event=>dialog.appendChild(button(`${event.project.code||event.project.name} · ${event.title}`,'ghost',()=>{close();setView('projects',event.project.id);})));});item.title=marker.events.map(event=>`${event.project.code||event.project.name} · ${event.title} · ${marker.date}`).join('\n');item.setAttribute('aria-label',`${marker.date} 주요 일정 ${marker.events.length}건`);markerRow.appendChild(item);return item;});
  if(!markerNodes.length)markerRow.appendChild(el('p','guide-dashboard-marker-empty','표시 기간에 등록된 주요 날짜가 없습니다.'));timeline.appendChild(markerRow);
  const rangeStart=Date.parse(data.startDate+'T00:00:00Z'),rangeEnd=Date.parse(data.endDate+'T00:00:00Z')+86400000;
  if(today>=data.startDate&&today<=data.endDate){const line=el('div','guide-dashboard-timeline-today');line.style.left=`${(Date.parse(today+'T00:00:00Z')-rangeStart)/(rangeEnd-rangeStart)*100}%`;line.title=`오늘 ${today}`;timeline.appendChild(line);}
  const labelRows=[];
  data.rows.forEach(row=>{const track=el('div','guide-dashboard-timeline-row'),bar=button('','guide-dashboard-project-period',()=>setView('projects',row.project.id));bar.style.left=`${row.left}%`;bar.style.width=`${row.width}%`;colors.apply(bar,row.project);track.style.setProperty('--bar-left',`${row.left}%`);
    if(state.fields.project)bar.appendChild(el('strong','',row.project.code||row.project.name));if(state.fields.title)bar.appendChild(el('small','',row.project.name));if(state.fields.dates)bar.appendChild(el('small','',MilestoneDashboardModel.shortDates(row.startDate,row.dueDate,today)));
    bar.title=`${row.project.name} · 조회 가능한 일정 ${row.startDate} ~ ${row.dueDate}`;bar.setAttribute('aria-label',bar.title);
    const label=button('','guide-dashboard-short-label',()=>setView('projects',row.project.id));label.setAttribute('aria-label',bar.title);label.title=bar.title;
    if(state.fields.project)label.appendChild(el('strong','',row.project.code||row.project.name));if(state.fields.title)label.appendChild(el('small','',row.project.name));if(state.fields.dates)label.appendChild(el('small','',MilestoneDashboardModel.shortDates(row.startDate,row.dueDate,today)));
    track.append(bar,label);timeline.appendChild(track);labelRows.push({track,bar,label});});
  if(!data.rows.length)timeline.appendChild(el('p','guide-dashboard-empty','선택한 기간과 조건에 맞는 프로젝트 일정이 없습니다.'));scroll.appendChild(timeline);content.append(scroll,el('p','guide-footnote','상단 주요 날짜는 마일스톤 목표일·기준 업무 마감일입니다. 막대는 조회 가능한 내 업무·주요 일정의 시작~종료 범위이며, 프로젝트 전체 공식 기간이나 연속 업무 배정 기간을 뜻하지 않습니다. 프로젝트를 누르면 세부 일정을 확인합니다.'));
  const updateLabels=()=>{labelRows.forEach(({track,bar,label})=>{const short=bar.clientWidth<MilestoneDashboardModel.VIEW_OPTIONS.timelineInlineLabelMinPx;track.classList.toggle('short-period',short);if(short)track.style.setProperty('--short-label-height',`${label.offsetHeight}px`);});
    const markers=MilestoneDashboardModel.markerLayout(data.markers,timeline.clientWidth);markers.forEach((marker,index)=>{markerNodes[index].style.left=`${marker.labelLeft}px`;markerNodes[index].style.top=`${marker.lane*26}px`;markerNodes[index].style.width=`${Math.min(timeline.clientWidth,MilestoneDashboardModel.VIEW_OPTIONS.timelineMarkerLabelPx)}px`;markerNodes[index].style.setProperty('--date-offset',`${marker.left/100*timeline.clientWidth-marker.labelLeft}px`);});markerRow.style.height=`${markers.length?(Math.max(...markers.map(marker=>marker.lane))+1)*26+6:30}px`;
  };
  requestAnimationFrame(updateLabels);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>{if(!timeline.isConnected){observer.disconnect();return;}updateLabels();});observer.observe(timeline);}
}
function refreshGuideDashboardToday(){if(activeView==='home'&&(isLead()?guideLeadDashboardView.today:guideDashboardView.today)!==dateKey(todayDate()))rerender();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshGuideDashboardToday();});setInterval(refreshGuideDashboardToday,60000);
