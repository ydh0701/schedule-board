/* Team overview: people and derived project allocation periods only. */
const guideTeamView={department:'',query:'',weeks:MilestoneTeamModel.DISPLAY_POLICY.defaultWeeks,followToday:true};
function openGuidePersonSchedule(id,period,teamState=guideTeamView){
  guidePersonalView.owner=id;
  const state=guidePersonalState(id);
  Object.assign(state,{project:period?.project.id||'',platform:period?.platform||'',status:'all',query:'',start:teamState.start,weeks:teamState.weeks,followToday:teamState.followToday});
  if(period) {const key=JSON.stringify([period.project.id,period.platform]);state.closed.delete(key);state.expanded.add(key);}
  setView('my-work');
}
function renderGuideTeam(main,options={}){
  if(!isLead()&&!isPM()){main.appendChild(el('p','guide-empty','팀별 현황을 볼 권한이 없습니다.'));return;}
  const state=MilestonePersonalModel.syncToday(options.state||guideTeamView,dateKey(todayDate()));
  const scope=options.scope||MilestonePersonalModel.viewers(activeUsers(),{...currentProfile,id:currentUser.uid},{all:isPM(),team:isLead()});
  const tools=el('div','guide-team-tools'),filters=el('div','guide-detail-filters'),period=el('div','guide-period');
  if(!options.compactTools){
  filters.append(guideSelect('직군',[['','전체 직군'],...[...new Set(scope.map(user=>user.departmentId))].map(id=>[id,departmentName(id)])],state.department,value=>{state.department=value;rerender();}),
    guideSearch('이름 검색',state.query,value=>{state.query=value;draw();}));
  if(options.projectFilters){
    const ids=new Set((options.tasks||activeTasks()).map(task=>task.projectId));
    filters.append(guideSelect('배치 프로젝트',[['','전체 프로젝트'],...projects.filter(project=>ids.has(project.id)&&project.status!=='archived').map(project=>[project.id,project.code||project.name])],state.project||'',value=>{state.project=value;rerender();}),guideSelect('배치 플랫폼',[['','전체 플랫폼'],...PLATFORMS.map(platform=>[platform.id,platform.name])],state.platform||'',value=>{state.platform=value;rerender();}));
  }
  }
  function move(days){const date=localDate(state.start);date.setDate(date.getDate()+days);state.start=dateKey(date);state.followToday=false;rerender();}
  const end=localDate(state.start);end.setDate(end.getDate()+state.weeks*7-1);const endKey=dateKey(end);
  if(options.compactTools)renderGuideTeamCompactTools(main,state,options,endKey,move,draw);
  else{
  period.append(button('‹ 이전','ghost tiny',()=>move(-state.weeks*7)),button('오늘','ghost tiny',()=>{state.start=dateKey(todayDate());state.followToday=true;rerender();}),button('다음 ›','ghost tiny',()=>move(state.weeks*7)),
    guideSelect('표시 기간',[[4,'4주'],[8,'8주'],[12,'12주']],String(state.weeks),value=>{state.weeks=Number(value);rerender();}),el('span','guide-period-label',`${state.start} ~ ${endKey}`));
  tools.append(filters,period);main.appendChild(tools);
  }
  const target=el('div','guide-gantt-scroll guide-team-scroll guide-outside-weeks');main.appendChild(target);
  function draw(){
    target.replaceChildren();const rows=MilestoneTeamModel.rows(scope,projects,options.tasks||activeTasks(),state,dateKey(todayDate()),holidays);
    const colors=guideProjectColorScope(rows.flatMap(item=>MilestoneTeamModel.lanes(item.periods,state.start,endKey).map(period=>period.project)));
    if(!rows.length){target.appendChild(el('div','guide-empty','조건에 맞는 직원이 없습니다.'));return;}
    const table=el('div','guide-gantt guide-team-gantt');table.style.setProperty('--days',state.weeks*7);table.style.setProperty('--timeline-min',`${state.weeks*7*(options.dayMin||12)}px`);
    const head=guideTimelineHeader(state,['직원 / 계획상 빈 일정'],true);head.querySelector('.guide-gantt-info').classList.add('guide-team-person-head');table.appendChild(head);
    rows.forEach(item=>{
      const periods=MilestoneTeamModel.lanes(item.periods,state.start,endKey),laneCount=Math.max(1,...periods.map(period=>period.lane+1));
      const row=el('div','guide-gantt-row guide-team-row');row.classList.toggle('guide-team-row-empty',!periods.length);row.style.minHeight=`${periods.length?Math.max(112,laneCount*62+20):76}px`;
      const person=el('div','guide-team-person'),title=el('div','guide-team-person-title');title.append(el('strong','',item.user.name||item.user.email),el('span','',userIdentityLabel(item.user)));
      person.appendChild(title);
      const free=item.availability,gap=free.gap,issues=free.issues;
      const availabilityLine=el('p','guide-team-availability');
      availabilityLine.append(el('small','','다음 빈 일정'),el('strong','',gap?`${MilestoneProjectModel.taskDateRange(gap.startDate,gap.dueDate,dateKey(todayDate()))} · ${gap.workingDays}근무일`:free.reason==='past'?'조회 기간에 향후 근무일 없음':'조회 기간 빈 일정 없음'));person.appendChild(availabilityLine);
      if(gap)person.appendChild(el('p','guide-team-next-assignment',`배정 후보 · ${MilestoneProjectModel.taskDateRange(gap.startDate,gap.startDate,dateKey(todayDate()))}부터`));
      const flags=[['overdue','지연'],['review','재확인'],['overlap','일정 겹침'],['undated','날짜 미정']].filter(([key])=>issues[key].length).map(([key,label])=>`${label} ${issues[key].length}건`);
      if(flags.length){const warning=button(flags.join(' · ')+' · 확인 필요','guide-team-warning',()=>{const {dialog,close}=openDialog(`${item.user.name} · 확인할 업무`),list=el('div','guide-dashboard-scroll');for(const [key,label]of [['overdue','지연'],['review','재확인'],['overlap','프로젝트 간 일정 겹침'],['undated','날짜 미정']]){if(!issues[key].length)continue;list.appendChild(el('h3','',label));issues[key].forEach(task=>{const entry=guideDashboardTask(task,colors);entry.onclick=()=>{close();openGuideTaskLocation(task);};list.appendChild(entry);});}dialog.appendChild(list);});warning.title='등록 일정 기준의 후보입니다. 미정·지연 업무와 휴가 등 미등록 일정을 확인하세요.';person.appendChild(warning);}
      person.appendChild(button('개인 일정 ›','guide-team-link',()=>openGuidePersonSchedule(item.user.id,null,state)));
      const timeline=guideTimelineCell(null,state);timeline.classList.add('guide-team-timeline');
      periods.forEach(period=>{
        const position=MilestoneProjectModel.timelinePosition(period,state.start,state.weeks*7);if(!position)return;
        const bar=button('','guide-team-allocation',()=>{
          const {dialog,close}=openDialog('프로젝트 배치');const content=el('div','task-readonly');content.append(el('h3','',period.project.name),el('p','',`${item.user.name} · ${platformName(period.platform)} · 업무 ${period.taskIds.length}건`),el('p','',`${period.startDate} ~ ${period.dueDate}`));
          const actions=el('div','form-actions');actions.append(button('닫기','ghost',close),button('해당 개인 일정 보기','primary',()=>{close();openGuidePersonSchedule(item.user.id,period,state);}));content.appendChild(actions);mountDialogForm(dialog,content);
        });bar.style.left=`${position.left}%`;bar.style.width=`${position.width}%`;bar.style.top=`${10+period.lane*62}px`;colors.apply(bar,period.project);
        const label=`${period.project.code||period.project.name} · ${platformName(period.platform)}`;
        // Short assignments keep the project code legible without widening the date bar.
        const narrow=position.width<12;
        bar.classList.toggle('narrow',narrow);
        bar.append(el('strong','',(period.startDate<state.start?'‹ ':'')+(narrow?(period.project.code||period.project.name):label)));
        if(!narrow) bar.appendChild(el('small','',MilestoneProjectModel.taskDateRange(period.startDate,period.dueDate,dateKey(todayDate()))));
        bar.title=`${period.project.name} · ${label} · ${period.startDate} ~ ${period.dueDate} · 업무 ${period.taskIds.length}건`;
        bar.setAttribute('aria-label',`${item.user.name} ${label} ${period.startDate}부터 ${period.dueDate}까지, 배치 상세 보기`);timeline.appendChild(bar);
      });
      if(!periods.length) timeline.appendChild(el('span','guide-team-no-period','조회 기간 배치 없음'));
      row.append(person,timeline);table.appendChild(row);
    });target.appendChild(table);
  }
  draw();
}
function renderGuideTeamCompactTools(main,state,options,endKey,move,draw){
  const tools=el('div','guide-dashboard-month-controls guide-team-compact-tools');
  const prev=button('‹','guide-dashboard-month-arrow',()=>move(-state.weeks*7)),next=button('›','guide-dashboard-month-arrow',()=>move(state.weeks*7));
  prev.setAttribute('aria-label','이전 기간');next.setAttribute('aria-label','다음 기간');
  tools.append(button('오늘','guide-dashboard-today',()=>{state.start=dateKey(todayDate());state.followToday=true;rerender();}),prev,next,
    guideSelect('표시 기간',[[4,'4주'],[8,'8주'],[12,'12주']],String(state.weeks),value=>{state.weeks=Number(value);rerender();}),
    el('span','guide-period-label',MilestoneDashboardModel.shortDates(state.start,endKey,dateKey(todayDate()))));
  const actions=el('div','guide-dashboard-tools'),search=guideSearch('이름 검색',state.query,value=>{state.query=value;draw();});
  actions.append(search,button(state.project||state.platform?'필터 · 적용 중':'필터','guide-dashboard-tool',()=>{
    const {dialog,close}=openDialog('팀 배치 필터'),form=el('div','form-grid'),draft={project:state.project||'',platform:state.platform||''};
    const ids=new Set((options.tasks||activeTasks()).map(task=>task.projectId));
    form.append(guideSelect('배치 프로젝트',[['','전체 프로젝트'],...projects.filter(project=>ids.has(project.id)&&project.status!=='archived').map(project=>[project.id,project.code||project.name])],draft.project,value=>draft.project=value),
      guideSelect('배치 플랫폼',[['','전체 플랫폼'],...PLATFORMS.map(platform=>[platform.id,platform.name])],draft.platform,value=>draft.platform=value),
      button('초기화','ghost',()=>{Object.assign(state,{project:'',platform:''});close();rerender();}),
      button('적용','primary',()=>{Object.assign(state,draft);close();rerender();}));mountDialogForm(dialog,form);positionGuidePopover(dialog,actions);
  }));tools.appendChild(actions);main.append(tools);
}
function refreshGuideTeamToday(){if((activeView==='people'||activeView==='team') && guideTeamView.today!==dateKey(todayDate())) rerender();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshGuideTeamToday();});
setInterval(refreshGuideTeamToday,60000);
