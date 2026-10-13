/* Pure scheduling engine. Preview only: no writes, no automatic conflict shifting. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.DependencyScheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const TYPES = ['after_task', 'before_task', 'during_task'];
  function date(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('날짜 형식이 올바르지 않습니다.');
    const result = new Date(value + 'T12:00:00Z');
    if(!Number.isFinite(result.getTime()) || result.toISOString().slice(0,10) !== value) throw new Error('존재하지 않는 날짜입니다.');
    return result;
  }
  function addWorkdays(value, amount, holidays = []){
    if(!value) return null;
    if(!Number.isInteger(amount)) throw new Error('일정 간격은 정수 작업일이어야 합니다.');
    const holidaySet = new Set(holidays), result = date(value), direction = amount < 0 ? -1 : 1;
    let remaining = Math.abs(amount);
    const working = () => ![0,6].includes(result.getUTCDay()) && !holidaySet.has(result.toISOString().slice(0,10));
    while(remaining){ result.setUTCDate(result.getUTCDate() + direction); if(working()) remaining--; }
    while(!working()) result.setUTCDate(result.getUTCDate() + direction);
    return result.toISOString().slice(0,10);
  }
  function dependencies(task){
    const rule = task.scheduleRule;
    if(!TYPES.includes(rule?.type)) return [];
    return [...new Set([...(rule.predecessorIds || []), rule.predecessorId].filter(Boolean))];
  }
  function protectedTask(task){ return task.status === 'done' || task.datePolicy === 'anchor' || task.dateLocked || task.dateOverride || task.scheduleMode === 'manual'; }
  function duration(task){
    const value = Math.ceil(Number(task.estimatedDays ?? 1));
    if(!Number.isFinite(value) || value < 1) throw new Error('예상 작업일은 1 이상이어야 합니다.');
    return value;
  }
  function recommend(task, predecessor, holidays = []){
    const rule = task.scheduleRule;
    if(!rule || !TYPES.includes(rule.type)) return null;
    const predecessors = Array.isArray(predecessor) ? predecessor : [predecessor];
    if(!predecessors.length || predecessors.some(item => !item)) return null;
    const references = predecessors.map(item => item[rule.referenceDate || (rule.type === 'before_task' ? 'startDate' : 'dueDate')]);
    if(references.some(value => !value)) return null;
    references.forEach(date);
    if(rule.type === 'during_task'){
      if(predecessors.length !== 1 || !predecessors[0].startDate || !predecessors[0].dueDate) return null;
      return {startDate:predecessors[0].startDate,dueDate:predecessors[0].dueDate};
    }
    const days = duration(task);
    if(rule.type === 'before_task'){
      const dueDate = addWorkdays(references.sort()[0], Number(rule.offsetWorkdays ?? -1), holidays);
      return {startDate:addWorkdays(dueDate, -(days-1), holidays), dueDate};
    }
    // End-date dependencies are strict finish-to-start: never overlap on the same day.
    const offset = rule.referenceDate === 'startDate' ? Number(rule.offsetWorkdays ?? 0) : Math.max(1, Number(rule.offsetWorkdays ?? 1));
    const startDate = addWorkdays(references.sort().at(-1), offset, holidays);
    return {startDate,dueDate:addWorkdays(startDate,days-1,holidays)};
  }
  function same(a,b){ return a?.startDate === b?.startDate && a?.dueDate === b?.dueDate; }
  function checkRange(dates){
    for(const value of [dates.startDate, dates.dueDate]) if(value) date(value);
    if(Boolean(dates.startDate) !== Boolean(dates.dueDate)) throw new Error('시작일과 마감일을 함께 입력해주세요.');
    if(dates.startDate && dates.dueDate < dates.startDate) throw new Error('마감일이 시작일보다 빠릅니다.');
  }
  function scheduleWarnings(list, options = {}){
    const map = new Map(list.filter(task=>!task.archivedAt).map(task=>[task.id,task])), warnings = [];
    function deadline(task, dates, rule, stepId){
      const anchor = map.get(rule.taskId);
      if(!anchor || anchor.projectId !== task.projectId) throw new Error('마감 기준 업무를 확인해주세요.');
      const reference = anchor[rule.referenceDate || 'startDate'];
      if(!reference || !dates?.dueDate){
        warnings.push({type:'missing_deadline',taskId:task.id,stepId:stepId || null,title:task.title,anchorId:anchor.id,message:'업무 또는 마감 기준 날짜가 미정입니다.'}); return;
      }
      const limit = addWorkdays(reference, Number(rule.offsetWorkdays ?? -1), options.holidays);
      if(dates.dueDate > limit) warnings.push({type:'deadline',taskId:task.id,stepId:stepId || null,title:task.title,anchorId:anchor.id,anchorTitle:anchor.title,dueDate:dates.dueDate,deadline:limit,message:'예상 종료일이 마감 기준을 넘습니다.'});
    }
    for(const task of map.values()){
      if(task.status === 'done') continue;
      for(const id of task.readinessDependsOn || []) {
        const preparation=map.get(id);
        if(!preparation || preparation.projectId!==task.projectId) throw new Error('착수 조건 업무를 확인해주세요.');
        if(task.startDate && (!preparation.dueDate || preparation.dueDate>=task.startDate)) warnings.push({type:'preparation',taskId:task.id,title:task.title,anchorId:id,anchorTitle:preparation.title,message:'착수 전에 준비 업무를 완료할 계획이 필요합니다.'});
      }
      for(const rule of task.deadlineRules || []) deadline(task,task,rule);
      for(const step of task.scheduleSteps || []){
        const dates = task.scheduleStepDates?.[step.id];
        for(const rule of step.deadlineRules || []) deadline(task,dates,rule,step.id);
        for(const id of dependencies({scheduleRule:step.scheduleRule})){
          const before=map.get(id);
          if(!before || before.projectId!==task.projectId) throw new Error('후속 작업의 선행 업무를 확인해주세요.');
          if(before.dueDate && dates?.startDate && dates.startDate<=before.dueDate) warnings.push({type:'dependency',taskId:task.id,stepId:step.id,title:task.title+' · '+step.title,anchorId:id,anchorTitle:before.title,message:'후속 작업이 선행 업무 종료 이전 또는 같은 날에 시작합니다.'});
        }
      }
      for(const id of dependencies(task)){
        const before = map.get(id);
        if(!before || before.projectId !== task.projectId) throw new Error('선행 업무를 확인해주세요.');
        if(task.scheduleRule.type === 'after_task' && task.scheduleRule.referenceDate !== 'startDate' && before.dueDate && task.startDate && task.startDate <= before.dueDate){
          warnings.push({type:'dependency',taskId:task.id,title:task.title,anchorId:id,anchorTitle:before.title,dueDate:before.dueDate,message:'선행 업무 종료일 이전 또는 같은 날에 시작합니다.'});
        }
      }
    }
    return warnings;
  }
  function previewChanges(tasks, rootId, dates, options = {}){
    const root = tasks.find(task=>task.id===rootId && !task.archivedAt);
    if(!root) throw new Error('기준 업무를 찾을 수 없습니다.');
    checkRange(dates);
    const list = tasks.filter(task=>!task.archivedAt && task.projectId===root.projectId);
    const original = new Map(list.map(task=>[task.id,task]));
    const effective = new Map(list.map(task=>[task.id,{...task}]));
    const changedRoot={...root,...options.rootPatch,...dates};
    effective.set(rootId,changedRoot);
    const holidays = options.holidays || [], visited = new Set(), visiting = new Set(), order = [];
    function visit(id){
      if(visiting.has(id)) throw new Error('업무 연결이 순환합니다.');
      if(visited.has(id)) return;
      visiting.add(id);
      for(const dependencyId of dependencies(id===rootId ? changedRoot : original.get(id))){
        if(!original.has(dependencyId)) throw new Error('선행 업무를 확인해주세요.');
        visit(dependencyId);
      }
      visiting.delete(id); visited.add(id); order.push(id);
    }
    list.forEach(task=>visit(task.id));
    const changes = [], retained = [], affected = new Set([rootId]);
    for(const id of order){
      if(id === rootId) continue;
      const task = original.get(id), ids = dependencies(task);
      if(!ids.length || !ids.some(key=>!same(original.get(key),effective.get(key)))) continue;
      affected.add(id);
      const before = ids.map(key=>original.get(key)), predecessors = ids.map(key=>effective.get(key));
      const proposed = recommend(task,predecessors,holidays);
      if(task.status === 'done' || task.datePolicy === 'anchor'){
        retained.push({id,title:task.title,reason:task.status==='done'?'완료 업무 유지':'기준 일정 유지'}); continue;
      }
      if(!proposed){retained.push({id,title:task.title,reason:'선행 일정 미정 · 현재 일정 유지'});continue;}
      if(protectedTask(task)){
        if(same(recommend(task,before,holidays),proposed)) continue;
        const review = same(task,proposed) ? null : {sourceTaskId:ids[0],sourceTaskIds:ids,recommendedStartDate:proposed.startDate,recommendedDueDate:proposed.dueDate,reason:'선행 일정이 변경되었습니다.',conflict:!!task.startDate && task.startDate < proposed.startDate};
        changes.push({id,title:task.title,kind:'review',before:{startDate:task.startDate,dueDate:task.dueDate},after:proposed,patch:{scheduleReview:review}});
        continue;
      }
      if(same(task,proposed)) continue;
      const patch = {...proposed,scheduleStatus:'scheduled',scheduleReview:null};
      changes.push({id,title:task.title,kind:'automatic',before:{startDate:task.startDate,dueDate:task.dueDate},after:proposed,patch});
      effective.set(id,{...task,...patch});
    }
    // Final resources are an internal step, not a prerequisite for dummy prefab construction.
    for(const task of list){
      if(protectedTask(task)) continue;
      for(const step of task.scheduleSteps || []){
        const ids = dependencies({scheduleRule:step.scheduleRule});
        if(!ids.length || !ids.some(id=>affected.has(id))) continue;
        const predecessors = ids.map(id=>effective.get(id));
        if(predecessors.some(item=>!item)) throw new Error('세부 작업의 선행 업무를 확인해주세요.');
        const after = recommend({estimatedDays:step.estimatedDays || 1,scheduleRule:step.scheduleRule},predecessors,holidays);
        affected.add(task.id);
        if(!after) continue;
        const current = effective.get(task.id), before = current.scheduleStepDates?.[step.id] || {};
        if(same(before,after)) continue;
        const scheduleStepDates = {...current.scheduleStepDates,[step.id]:after};
        changes.push({id:task.id,title:task.title+' · '+step.title,kind:'step',stepId:step.id,before,after,patch:{scheduleStepDates}});
        effective.set(task.id,{...current,scheduleStepDates});
      }
    }
    let warnings = scheduleWarnings([...effective.values()],options).filter(w=>affected.has(w.taskId) || affected.has(w.anchorId));
    const candidates = [...effective.values()].filter(task=>affected.has(task.id) && task.status!=='done' && task.startDate && task.dueDate);
    const peers = options.conflictTasks || tasks;
    const people = task => [...new Set([task.assigneeId,...(task.assigneeIds || []),...(task.assignees || []).map(item=>item.userId),...(task.supporterIds || [])].filter(Boolean))];
    for(const task of candidates){
      for(const peer of peers){
        const effectivePeer = effective.get(peer.id) || peer;
        if(effectivePeer.id===task.id || effectivePeer.archivedAt || effectivePeer.status==='done' || !effectivePeer.startDate || !effectivePeer.dueDate) continue;
        if(task.projectId===effectivePeer.projectId && (task.taskScope==='project' || effectivePeer.taskScope==='project')) continue; // Shared participation is expected only within the same project.
        if(task.startDate<=effectivePeer.dueDate && task.dueDate>=effectivePeer.startDate && people(task).some(id=>people(effectivePeer).includes(id))){
          warnings.push({type:'overlap',taskId:task.id,title:task.title,anchorId:effectivePeer.id,anchorTitle:effectivePeer.title,message:'담당자의 다른 업무와 기간이 겹칩니다.'});
        }
      }
    }
    const seenWarnings=new Set();
    warnings = warnings.filter(w=>{const key=JSON.stringify([w.type,w.taskId,w.anchorId,w.stepId]);if(seenWarnings.has(key))return false;seenWarnings.add(key);return true;});
    const rootChange = same(root,dates) ? null : {title:root.title,before:{startDate:root.startDate,dueDate:root.dueDate},after:dates};
    return {rootId,rootChange,changes,retained,warnings};
  }
  return {addWorkdays,previewChanges,recommendDates:recommend,dependencies,scheduleWarnings};
});
