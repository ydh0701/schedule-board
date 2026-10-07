/* Derived allocation periods, not a second copy of task data. */
(function(root){
  const DISPLAY_POLICY={defaultWeeks:8,currentTaskLimit:2};
  function assigned(task,id){return task.assigneeId===id || (task.assigneeIds||[]).includes(id) || (task.assignees||[]).some(item=>item.userId===id);}
  function nextDay(date){const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10);}
  function rows(users,projects,tasks,filters,today){
    const projectMap=new Map(projects.filter(project=>project.status!=='archived').map(project=>[project.id,project]));
    const query=String(filters.query||'').trim().toLocaleLowerCase();
    const available=tasks.filter(task=>!task.archivedAt && projectMap.has(task.projectId)&&(!filters.project||task.projectId===filters.project)&&(!filters.platform||task.platform===filters.platform));
    return users.filter(user=>user.active && (!filters.department || user.departmentId===filters.department)
      && (!query || String(user.name||user.email||'').toLocaleLowerCase().includes(query))).map(user=>{
      const items=available.filter(task=>assigned(task,user.id));
      const current=items.filter(task=>task.status!=='done' && (task.status==='in_progress' || (task.startDate&&task.dueDate&&task.startDate<=today&&task.dueDate>=today)))
        .sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
      const buckets=new Map();let undated=0;
      items.forEach(task=>{
        if(!task.startDate||!task.dueDate||task.dueDate<task.startDate || !Number.isFinite(Date.parse(task.startDate+'T00:00:00Z')) || !Number.isFinite(Date.parse(task.dueDate+'T00:00:00Z'))){if(task.status!=='done') undated++;return;}
        const key=JSON.stringify([task.projectId,task.platform||'']);
        if(!buckets.has(key)) buckets.set(key,[]);buckets.get(key).push(task);
      });
      const periods=[];
      buckets.forEach(items=>{
        items.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.dueDate.localeCompare(b.dueDate));let previous;
        items.forEach(task=>{
          if(previous && task.startDate<=nextDay(previous.dueDate)){
            previous.dueDate=previous.dueDate>task.dueDate?previous.dueDate:task.dueDate;previous.taskIds.push(task.id);
          }else{
            previous={project:projectMap.get(task.projectId),platform:task.platform||'',startDate:task.startDate,dueDate:task.dueDate,taskIds:[task.id]};periods.push(previous);
          }
        });
      });
      return {user,current,undated,periods:periods.sort((a,b)=>a.startDate.localeCompare(b.startDate))};
    }).sort((a,b)=>String(a.user.name||'').localeCompare(String(b.user.name||''),'ko'));
  }
  function lanes(periods,start,end){
    const lanesEnd=[];
    return periods.filter(period=>period.dueDate>=start && period.startDate<=end).map(period=>{
      let lane=lanesEnd.findIndex(date=>date<period.startDate);if(lane===-1) lane=lanesEnd.length;
      lanesEnd[lane]=period.dueDate;return {...period,lane};
    });
  }
  const api={DISPLAY_POLICY,rows,lanes};
  if(typeof module==='object'&&module.exports) module.exports=api;else root.MilestoneTeamModel=api;
})(typeof window!=='undefined'?window:globalThis);
