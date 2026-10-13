/* Pure UI selectors. No database writes, DOM, or hard-coded project stages. */
(function(root){
  function stageSummary(project, tasks){
    const stages=(project.stageSnapshots || []).slice().sort((a,b)=>a.order-b.order);
    if(!stages.length) stages.push({id:'all',name:'전체 업무',order:1});
    const result=stages.map(stage=>{
      const items=tasks.filter(task=>stage.id==='all' || (task.stageId || task.phaseId)===stage.id);
      const done=items.filter(task=>task.status==='done').length;
      const dates=items.flatMap(task=>[task.startDate,task.dueDate]).filter(Boolean).sort();
      return {...stage,total:items.length,done,progress:items.length?Math.round(done/items.length*100):0,startDate:dates[0]||null,dueDate:dates.at(-1)||null,state:items.length && done===items.length?'done':'upcoming'};
    });
    const current=result.find(stage=>stage.state!=='done' && tasks.some(task=>(task.stageId||task.phaseId)===stage.id && task.status==='in_progress')) || result.find(stage=>stage.total && stage.state!=='done');
    if(current) current.state='current';
    return result;
  }
  function filterTasks(tasks, filters={}){
    const q=String(filters.query || '').trim().toLocaleLowerCase();
    return tasks.filter(task=>(!filters.platform || task.platform===filters.platform)
      && (Array.isArray(filters.departments)?filters.departments.includes(task.departmentId):!filters.department || task.departmentId===filters.department)
      && (!filters.assignee || task.assigneeId===filters.assignee || (task.assigneeIds||[]).includes(filters.assignee) || (task.assignees||[]).some(item=>item.userId===filters.assignee))
      && (!filters.stage || (task.stageId||task.phaseId)===filters.stage)
      && (Array.isArray(filters.statuses)?filters.statuses.includes(task.status==='done'?'done':task.status==='in_progress'?'progress':'upcoming'):filters.status==='all' || (filters.status==='review'?!!task.scheduleReview:task.status!=='done'))
      && (!q || [task.title,task.externalAssigneeName,task.assigneeName].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)));
  }
  function filterProjects(projects,tasks,filters={}){
    const query=String(filters.query||'').trim().toLocaleLowerCase();
    return projects.filter(project=>{
      if(project.status==='archived'||!`${project.code||''} ${project.name||''}`.toLocaleLowerCase().includes(query))return false;
      if(filters.platform&&!(project.platforms||[]).includes(filters.platform))return false;
      if(!filters.department&&!filters.assignee)return true;
      const rows=[...(project.staffing||[]).map(item=>({platform:item.platform,departmentId:item.departmentId,ids:[item.userId]})),
        ...tasks.filter(task=>task.projectId===project.id&&!task.archivedAt).map(task=>({platform:task.platform,departmentId:task.departmentId,ids:[task.assigneeId,...(task.assigneeIds||[]),...(task.assignees||[]).map(item=>item.userId)]}))];
      return rows.some(row=>(!filters.platform||row.platform===filters.platform)&&(!filters.department||row.departmentId===filters.department)&&(!filters.assignee||row.ids.includes(filters.assignee)));
    });
  }
  function timelinePosition(task, startDate, days){
    if(!task.startDate || !task.dueDate || !days) return null;
    const dayMs=86400000, start=Date.parse(startDate+'T00:00:00Z');
    const left=Math.round((Date.parse(task.startDate+'T00:00:00Z')-start)/dayMs);
    const right=Math.round((Date.parse(task.dueDate+'T00:00:00Z')-start)/dayMs)+1;
    if(!Number.isFinite(left)||!Number.isFinite(right)||right<=left||right<=0||left>=days) return null;
    return {left:Math.max(0,left)/days*100,width:(Math.min(days,right)-Math.max(0,left))/days*100};
  }
  const DETAIL_DISPLAY_POLICY={previewLimit:3};
  function detailGroups(tasks,filters,today,expanded=new Set()){
    const full=Boolean(String(filters.query||'').trim()||filters.status==='review');
    const priority=task=>task.status==='done'?3:task.status==='in_progress'||task.startDate<=today&&task.dueDate>=today?0:task.dueDate<today?1:2;
    return [...new Set(tasks.map(task=>task.departmentId))].map(id=>{
      const items=tasks.filter(task=>task.departmentId===id),scheduled=items.filter(task=>Boolean(task.startDate&&task.dueDate&&task.startDate<=task.dueDate&&Number.isFinite(Date.parse(task.startDate+'T00:00:00Z'))&&Number.isFinite(Date.parse(task.dueDate+'T00:00:00Z'))));
      const datedIds=new Set(scheduled);scheduled.sort((a,b)=>priority(a)-priority(b)||a.startDate.localeCompare(b.startDate)||String(a.title).localeCompare(String(b.title)));
      const completed=scheduled.filter(task=>task.status==='done'),active=scheduled.filter(task=>task.status!=='done');
      const showAll=full||expanded.has(id);
      return {id,scheduled,completed,active,remaining:active.slice(DETAIL_DISPLAY_POLICY.previewLimit),undated:items.filter(task=>!datedIds.has(task)),visible:showAll?active:active.slice(0,DETAIL_DISPLAY_POLICY.previewLimit),expanded:showAll,full};
    });
  }
  function taskPresentation(task,today){
    if(task.status==='done') return {label:'완료',key:'done'};
    if(task.scheduleReview) return {label:'재확인',key:'review'};
    // 기존 blocked 의미/이름은 유지하며 보류 계열 노랑으로 표시한다.
    if(task.status==='blocked') return {label:'차단',key:'blocked'};
    if(task.dueDate && task.dueDate<today) return {label:'지연',key:'overdue'};
    if(task.status==='in_progress') return {label:'진행 중',key:'progress'};
    return {label:'대기',key:'waiting'};
  }
  function taskDateRange(start,end,today){
    if(!start || !end) return '일정 미정';
    const showYear=start.slice(0,4)!==today.slice(0,4)||end.slice(0,4)!==today.slice(0,4);
    const format=value=>(showYear?value:value.slice(5)).replaceAll('-','.');
    return start===end?format(start):`${format(start)} ~ ${format(end)}`;
  }
  function syncToday(state,today){
    if(!state.start || (state.today!==today && state.followToday!==false)) state.start=today;
    state.today=today;
    return state;
  }
  function taskDetailSummary(task,all){
    const supportIds=[...new Set([...(task.assigneeIds||[]),...(task.assignees||[]).map(item=>item.userId)].filter(id=>id&&id!==task.assigneeId))];
    const ids=[...new Set([...(task.readinessDependsOn||[]),...(['before_task','during_task'].includes(task.scheduleRule?.type)?[]:task.dependsOn||[])])];
    const dependencies=ids.map(id=>({id,task:all.find(item=>item.id===id&&item.projectId===task.projectId&&!item.archivedAt)||null}));
    const missing=dependencies.filter(item=>!item.task).length,pending=dependencies.filter(item=>item.task&&item.task.status!=='done').length;
    const readiness=task.status==='done'?'완료된 업무':task.status==='in_progress'?'진행 중':task.status==='blocked'?'차단 상태 · 착수 확인 필요':missing?`선행 조건 확인 불가 ${missing}건`:pending?`미완료 선행 ${pending}건`:ids.length?'선행 완료 · 결과물 확인 필요':'등록된 선행 없음 · 착수 확인 필요';
    const mode=task.datePolicy==='anchor'?'기준 일정':task.dateOverride||task.scheduleMode==='manual'?'수동 일정':task.scheduleMode==='automatic'||task.generated?'자동 일정':'일정 방식 미지정';
    return {supportIds,dependencies,readiness,mode,locked:Boolean(task.dateLocked)};
  }
  const api={stageSummary,filterTasks,filterProjects,timelinePosition,taskPresentation,taskDateRange,syncToday,detailGroups,taskDetailSummary,DETAIL_DISPLAY_POLICY};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.MilestoneProjectModel=api;
})(typeof window!=='undefined'?window:globalThis);
