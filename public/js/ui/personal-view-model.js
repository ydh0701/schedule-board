/* Personal schedule selectors: data in, display groups out. No writes or DOM. */
(function(root){
  const DISPLAY_POLICY={previewLimit:3,defaultWeeks:4};
  function assigned(task,userId){
    return !!userId && (task.assigneeId===userId || (task.assigneeIds||[]).includes(userId) || (task.assignees||[]).some(item=>item.userId===userId));
  }
  function viewers(users,current,privileges={}){
    return users.filter(user=>user.active && (user.id===current.id || privileges.all || (privileges.team && user.departmentId===current.departmentId)));
  }
  function personalTasks(tasks,projects,userId){
    const available=new Set(projects.filter(project=>project.status!=='archived').map(project=>project.id));
    return tasks.filter(task=>!task.archivedAt && available.has(task.projectId) && assigned(task,userId));
  }
  function priority(task,today){
    if(task.status==='done') return 4;
    if(task.status==='in_progress' || (task.startDate && task.dueDate && task.startDate<=today && task.dueDate>=today)) return 0;
    if(task.dueDate && task.dueDate<today) return 1;
    return task.startDate?2:3;
  }
  function hasSchedule(task){return Boolean(task.startDate&&task.dueDate&&Number.isFinite(Date.parse(task.startDate+'T00:00:00Z'))&&Number.isFinite(Date.parse(task.dueDate+'T00:00:00Z'))&&task.startDate<=task.dueDate);}
  function groups(tasks,projects,filters={},today,expanded=new Set()){
    const query=String(filters.query||'').trim().toLocaleLowerCase();
    const buckets=new Map();
    tasks.filter(task=>(!filters.project || task.projectId===filters.project)
      && (!filters.platform || task.platform===filters.platform)
      && (filters.status==='all' || (filters.status==='review'?!!task.scheduleReview:task.status!=='done'))
      && (!query || String(task.title||'').toLocaleLowerCase().includes(query))).forEach(task=>{
      const key=JSON.stringify([task.projectId,task.platform||'']);
      if(!buckets.has(key)) buckets.set(key,{key,project:projects.find(project=>project.id===task.projectId),platform:task.platform||'',tasks:[]});
      buckets.get(key).tasks.push(task);
    });
    return [...buckets.values()].map(group=>{
      group.tasks.sort((a,b)=>priority(a,today)-priority(b,today) || String(a.startDate||a.dueDate||'9999').localeCompare(String(b.startDate||b.dueDate||'9999')) || String(a.title).localeCompare(String(b.title)));
      // Search/review/completed filters explicitly request results: do not hide matches behind a preview.
      const full=expanded.has(group.key) || !!query || filters.status==='all' || filters.status==='review';
      const scheduled=group.tasks.filter(hasSchedule),undated=group.tasks.filter(task=>!hasSchedule(task));
      return {...group,scheduled,undated,expanded:full,visible:full?scheduled:scheduled.slice(0,DISPLAY_POLICY.previewLimit)};
    }).sort((a,b)=>String(a.project?.code||a.project?.name).localeCompare(String(b.project?.code||b.project?.name),undefined,{numeric:true}) || a.platform.localeCompare(b.platform));
  }
  function syncToday(state,today){
    if(!state.start || (state.today!==today && state.followToday!==false)) state.start=today;
    state.today=today;return state;
  }
  const api={DISPLAY_POLICY,assigned,viewers,personalTasks,groups,hasSchedule,syncToday};
  if(typeof module==='object'&&module.exports) module.exports=api;else root.MilestonePersonalModel=api;
})(typeof window!=='undefined'?window:globalThis);
