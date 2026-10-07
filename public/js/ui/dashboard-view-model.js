/* Personal dashboard read models. Progress is explicitly own work, not company-wide totals. */
(function(root){
  const DISPLAY_POLICY={summaryLimit:3,calendarLanes:3};
  const VIEW_OPTIONS={
    kinds:[['all','전체 일정'],['task','내 업무'],['major','주요 일정']],
    statuses:[['all','완료 포함'],['active','미완료'],['done','완료']],
    sorts:[['start','시작일순'],['due','종료일순'],['title','이름순']],
    fields:[['project','프로젝트명'],['title','일정명'],['dates','날짜']],
    timelineMonths:16,timelineMoveMonths:6,timelineInlineLabelMinPx:140,timelineMarkerLabelPx:150
  };
  function majorDateMarkers(events,startDate,endDate){
    const groups=new Map(),start=Date.parse(startDate+'T00:00:00Z'),length=Date.parse(endDate+'T00:00:00Z')+86400000-start;
    events.filter(event=>(event.kind!=='task'||event.task?.datePolicy==='anchor')&&event.dueDate>=startDate&&event.dueDate<=endDate).forEach(event=>{
      if(!groups.has(event.dueDate))groups.set(event.dueDate,[]);groups.get(event.dueDate).push(event);
    });
    return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,events:items,left:(Date.parse(date+'T00:00:00Z')-start)/length*100}));
  }
  function markerLayout(markers,width,labelWidth=VIEW_OPTIONS.timelineMarkerLabelPx){
    const slots=[];return markers.map(marker=>{
      const size=Math.min(labelWidth,width),left=Math.min(Math.max(marker.left/100*width,0),Math.max(width-size,0));
      let lane=slots.findIndex(end=>end<=left);if(lane===-1)lane=slots.length;slots[lane]=left+size;
      return {...marker,labelLeft:left,lane};
    });
  }
  function eventStatus(event){return event.task?.status||event.source?.status||'todo';}
  function upcomingMajorEvents(events,today){
    return events.filter(event=>(event.kind!=='task'||event.task?.datePolicy==='anchor')&&eventStatus(event)!=='done'&&event.dueDate>=today)
      .sort((a,b)=>a.startDate.localeCompare(b.startDate)||String(a.id).localeCompare(String(b.id)));
  }
  // Display preferences only: never change shared milestones, dates, or owners.
  function personalMajorCandidates(ownTasks){
    return ownTasks.filter(task=>!task.archivedAt&&task.status!=='done')
      .slice().sort((a,b)=>String(a.startDate||'9999').localeCompare(String(b.startDate||'9999'))||String(a.title||'').localeCompare(String(b.title||''),'ko'));
  }
  function selectedMajorTasks(ownTasks,ids){
    const selected=new Set(Array.isArray(ids)?ids:[]);
    return personalMajorCandidates(ownTasks).filter(task=>selected.has(task.id));
  }
  function majorPreferenceKey(scope,userId){return 'milestone-personal-major-v1:'+scope+':'+userId;}
  function readMajorSelection(storage,scope,userId){
    try{const ids=JSON.parse(storage.getItem(majorPreferenceKey(scope,userId))||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'))]:[];}catch{return [];}
  }
  function writeMajorSelection(storage,scope,userId,ids){
    storage.setItem(majorPreferenceKey(scope,userId),JSON.stringify([...new Set(ids)]));
  }
  function filterEvents(events,settings={}){
    const query=String(settings.query||'').trim().toLocaleLowerCase();
    const result=events.filter(event=>{
      const major=event.kind!=='task'||event.task?.datePolicy==='anchor',status=eventStatus(event);
      return (!settings.project||event.project.id===settings.project)&&(!settings.platform||(event.task?.platform||event.source?.version||'')===settings.platform)&&
        (!settings.kind||settings.kind==='all'||(settings.kind==='major'?major:event.kind==='task'))&&
        (!settings.status||settings.status==='all'||(settings.status==='done'?status==='done':status!=='done'))&&
        (!query||[event.project.code,event.project.name,event.title].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
    });
    const field=settings.sort==='due'?'dueDate':settings.sort==='title'?'title':'startDate';
    return result.sort((a,b)=>String(a[field]).localeCompare(String(b[field]),'ko')||String(a.id).localeCompare(String(b.id)));
  }
  function timeline(events,startMonth,count=VIEW_OPTIONS.timelineMonths,sort='start'){
    const first=new Date(startMonth+'-01T00:00:00Z'),end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+count,1));
    const key=date=>date.toISOString().slice(0,10),length=end-first;
    const months=Array.from({length:count},(_,i)=>key(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+i,1))).slice(0,7));
    const groups=new Map();
    events.forEach(event=>{if(!groups.has(event.project.id))groups.set(event.project.id,{project:event.project,events:[]});groups.get(event.project.id).events.push(event);});
    const rows=[...groups.values()].map(group=>{
      const start=group.events.map(event=>event.startDate).sort()[0],due=group.events.map(event=>event.dueDate).sort().at(-1);
      const left=Math.max(first.getTime(),Date.parse(start+'T00:00:00Z')),right=Math.min(end.getTime(),Date.parse(due+'T00:00:00Z')+86400000);
      return {...group,startDate:start,dueDate:due,left:(left-first)/length*100,width:(right-left)/length*100};
    }).filter(row=>row.width>0).sort((a,b)=>sort==='title'?String(a.project.name||a.project.code||a.project.id).localeCompare(String(b.project.name||b.project.code||b.project.id),'ko'):String(a[sort==='due'?'dueDate':'startDate']).localeCompare(String(b[sort==='due'?'dueDate':'startDate'])));
    const columns=months.map((month,index)=>{const from=Date.parse(month+'-01T00:00:00Z'),to=index+1<months.length?Date.parse(months[index+1]+'-01T00:00:00Z'):end.getTime();return {month,left:(from-first)/length*100,width:(to-from)/length*100};});
    return {months,columns,rows,startDate:key(first),endDate:key(new Date(end-86400000)),markers:majorDateMarkers(events,key(first),key(new Date(end-86400000)))};
  }
  function completionDate(value){
    if(!value)return '';
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const date=typeof value==='string'?new Date(value):value instanceof Date?value:typeof value.toDate==='function'?value.toDate():typeof value.seconds==='number'?new Date(value.seconds*1000):null;
    if(!date||Number.isNaN(date.getTime()))return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function shortDates(start,end,today){
    if(!start||!end)return '일정 미정';
    const includeYear=start.slice(0,4)!==today.slice(0,4)||end.slice(0,4)!==today.slice(0,4);
    const format=value=>(includeYear?value:value.slice(5)).replaceAll('-','.');
    return start===end?format(start):`${format(start)} ~ ${format(end)}`;
  }
  function summary(tasks,today){
    const active=tasks.filter(task=>task.status!=='done');
    const attention=active.filter(task=>task.scheduleReview || task.status==='blocked' || (task.dueDate&&task.dueDate<today));
    const ids=new Set(attention.map(task=>task.id));
    const current=active.filter(task=>!ids.has(task.id) && (task.status==='in_progress' || (task.startDate&&task.dueDate&&task.startDate<=today&&task.dueDate>=today)));
    current.forEach(task=>ids.add(task.id));
    const next=active.filter(task=>!ids.has(task.id) && task.startDate&&task.dueDate&&task.startDate>today).sort((a,b)=>a.startDate.localeCompare(b.startDate));
    const undated=active.filter(task=>!ids.has(task.id)&&(!task.startDate||!task.dueDate));
    const completedToday=tasks.filter(task=>task.status==='done'&&completionDate(task.completedAt)===today);
    return {attention:attention.sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))),current:[...current,...completedToday],next,undated};
  }
  function participation(projects,tasks){
    return projects.filter(project=>project.status!=='archived' && project.status!=='completed' && tasks.some(task=>task.projectId===project.id)).map(project=>{
      const own=tasks.filter(task=>task.projectId===project.id);
      const platforms=[...new Set(own.map(task=>task.platform||''))].map(platform=>{
        const rows=own.filter(task=>(task.platform||'')===platform),done=rows.filter(task=>task.status==='done').length;
        const current=rows.find(task=>task.status==='in_progress') || rows.find(task=>task.status!=='done');
        return {platform,total:rows.length,done,progress:Math.round(done/rows.length*100),stage:project.stageSnapshots?.find(stage=>stage.id===(current?.stageId||current?.phaseId))?.name||'단계 미정'};
      });return {project,platforms};
    });
  }
  function events(projects,ownTasks,milestones,allTasks){
    const ids=new Set(ownTasks.map(task=>task.projectId)),projectMap=new Map(projects.filter(project=>project.status!=='archived' && ids.has(project.id)).map(project=>[project.id,project]));
    const result=ownTasks.filter(task=>task.startDate&&task.dueDate&&task.startDate<=task.dueDate).map(task=>({id:'task:'+task.id,kind:'task',project:projectMap.get(task.projectId),title:task.title,startDate:task.startDate,dueDate:task.dueDate,task})).filter(event=>event.project);
    const ownIds=new Set(ownTasks.map(task=>task.id));
    milestones.filter(item=>!item.archivedAt&&item.dueDate&&projectMap.has(item.projectId)).forEach(item=>result.push({id:'milestone:'+item.id,kind:'milestone',project:projectMap.get(item.projectId),title:item.title,startDate:item.dueDate,dueDate:item.dueDate,source:item}));
    allTasks.filter(task=>!task.archivedAt&&task.datePolicy==='anchor'&&task.startDate&&task.dueDate&&task.startDate<=task.dueDate&&!ownIds.has(task.id)&&projectMap.has(task.projectId)).forEach(task=>result.push({id:'anchor:'+task.id,kind:'anchor',project:projectMap.get(task.projectId),title:task.title,startDate:task.startDate,dueDate:task.dueDate,task}));
    return result;
  }
  function calendarWeeks(events,month,sort='start'){
    const first=new Date(month+'-01T00:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));
    const start=new Date(first);start.setUTCDate(start.getUTCDate()-start.getUTCDay());
    const count=Math.ceil((first.getUTCDay()+last.getUTCDate())/7),result=[];
    const key=date=>date.toISOString().slice(0,10);
    for(let week=0;week<count;week++){
      const from=new Date(start);from.setUTCDate(from.getUTCDate()+week*7);const to=new Date(from);to.setUTCDate(to.getUTCDate()+6);
      const slots=[];
      const segments=events.filter(event=>event.startDate<=key(to)&&event.dueDate>=key(from)).sort((a,b)=>sort==='title'?String(a.title).localeCompare(String(b.title),'ko'):sort==='due'?a.dueDate.localeCompare(b.dueDate):a.startDate.localeCompare(b.startDate)||b.dueDate.localeCompare(a.dueDate)).map(event=>{
        const left=event.startDate<key(from)?key(from):event.startDate,right=event.dueDate>key(to)?key(to):event.dueDate;
        const column=Math.round((Date.parse(left+'T00:00:00Z')-from.getTime())/86400000),endColumn=Math.round((Date.parse(right+'T00:00:00Z')-from.getTime())/86400000);
        let lane=slots.findIndex(end=>end<column);if(lane===-1)lane=slots.length;slots[lane]=endColumn;
        return {...event,column,span:endColumn-column+1,lane};
      });
      result.push({days:Array.from({length:7},(_,i)=>{const date=new Date(from);date.setUTCDate(date.getUTCDate()+i);return key(date);}),segments});
    }return result;
  }
  // Scope before deriving counts; unassigned team work remains visible to the lead.
  function teamOverview(projects,tasks,milestones,departmentId,today){
    const available=new Set(projects.filter(project=>project.status!=='archived').map(project=>project.id));
    const teamTasks=tasks.filter(task=>departmentId&&task.departmentId===departmentId&&!task.archivedAt&&available.has(task.projectId));
    const active=teamTasks.filter(task=>task.status!=='done');
    const issues={overdue:active.filter(task=>task.dueDate&&task.dueDate<today),review:active.filter(task=>task.scheduleReview),undated:active.filter(task=>!task.startDate||!task.dueDate||task.startDate>task.dueDate)};
    const major=events(projects,teamTasks,milestones,tasks).filter(event=>event.kind!=='task'||event.task?.datePolicy==='anchor').map(event=>({...event,startDate:event.dueDate}));
    return {tasks:teamTasks,issues,events:major};
  }
  function teamIssueItems(issues){
    return [['overdue','지연 업무'],['review','일정 변경 확인 필요'],['undated','날짜 미정 업무']]
      .map(([id,label])=>({id,label,tasks:issues[id]||[]})).filter(item=>item.tasks.length);
  }
  const api={DISPLAY_POLICY,VIEW_OPTIONS,summary,participation,events,calendarWeeks,completionDate,shortDates,filterEvents,timeline,eventStatus,upcomingMajorEvents,personalMajorCandidates,selectedMajorTasks,readMajorSelection,writeMajorSelection,majorDateMarkers,markerLayout,teamOverview,teamIssueItems};
  if(typeof module==='object'&&module.exports) module.exports=api;else root.MilestoneDashboardModel=api;
})(typeof window!=='undefined'?window:globalThis);
