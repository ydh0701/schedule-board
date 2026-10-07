/* Pure scheduling engine: browser and Node. Changes are returned for preview, never saved here. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.DependencyScheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function date(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('날짜 형식이 올바르지 않습니다.');
    const result = new Date(`${value}T12:00:00Z`);
    if(!Number.isFinite(result.getTime()) || result.toISOString().slice(0,10) !== value) throw new Error('존재하지 않는 날짜입니다.');
    return result;
  }
  function addWorkdays(value, amount, holidays = []){
    if(!value) return null;
    if(!Number.isInteger(amount)) throw new Error('일정 간격은 정수 작업일이어야 합니다.');
    const holidaySet = new Set(holidays);
    const result = date(value);
    const direction = amount < 0 ? -1 : 1;
    let remaining = Math.abs(amount);
    while(remaining){
      result.setUTCDate(result.getUTCDate() + direction);
      if(![0,6].includes(result.getUTCDay()) && !holidaySet.has(result.toISOString().slice(0,10))) remaining--;
    }
    // An offset of zero still starts on a working day.
    while([0,6].includes(result.getUTCDay()) || holidaySet.has(result.toISOString().slice(0,10))) result.setUTCDate(result.getUTCDate() + direction);
    return result.toISOString().slice(0,10);
  }
  function recommend(task, predecessor, holidays){
    const rule = task.scheduleRule;
    const reference = rule.referenceDate === 'startDate' ? predecessor.startDate : predecessor.dueDate;
    if(!reference) return null;
    const startDate = addWorkdays(reference, Number(rule.offsetWorkdays || 0), holidays);
    const duration = Math.max(1, Math.ceil(Number(task.estimatedDays || 1)));
    if(!Number.isFinite(duration)) throw new Error('예상 작업일이 올바르지 않습니다.');
    return { startDate, dueDate: addWorkdays(startDate, duration - 1, holidays) };
  }
  function same(a,b){ return a?.startDate === b?.startDate && a?.dueDate === b?.dueDate; }
  function previewChanges(tasks, rootId, dates, options = {}){
    const list = tasks.filter(task => !task.archivedAt);
    const original = new Map(list.map(task => [task.id, task]));
    const root = original.get(rootId);
    if(!root) throw new Error('기준 업무를 찾을 수 없습니다.');
    for(const value of [dates.startDate, dates.dueDate]) if(value) date(value);
    if(Boolean(dates.startDate) !== Boolean(dates.dueDate)) throw new Error('시작일과 마감일을 함께 입력해주세요.');
    if(dates.startDate && dates.dueDate < dates.startDate) throw new Error('마감일이 시작일보다 빠릅니다.');
    const holidays = options.holidays || [];
    const effective = new Map(list.map(task => [task.id, { ...task }]));
    effective.set(rootId, { ...root, ...dates });
    const visited = new Set(), visiting = new Set(), order = [];
    function visit(id){
      if(visiting.has(id)) throw new Error('업무 연결이 순환합니다.');
      if(visited.has(id)) return;
      visiting.add(id);
      const task = original.get(id);
      const predecessorId = task.scheduleRule?.type === 'after_task' ? task.scheduleRule.predecessorId : null;
      if(predecessorId){
        const predecessor = original.get(predecessorId);
        if(!predecessor || predecessor.projectId !== task.projectId) throw new Error('선행 업무를 확인해주세요.');
        visit(predecessorId);
      }
      visiting.delete(id); visited.add(id); order.push(id);
    }
    list.forEach(task => visit(task.id));
    const changes = [], retained = [];
    for(const id of order){
      if(id === rootId) continue;
      const task = original.get(id), rule = task.scheduleRule;
      if(rule?.type !== 'after_task') continue;
      const beforePredecessor = original.get(rule.predecessorId), predecessor = effective.get(rule.predecessorId);
      if(same(beforePredecessor, predecessor)) continue;
      if(task.status === 'done' || task.datePolicy === 'anchor'){
        retained.push({ id, title: task.title, reason: task.status === 'done' ? '완료 업무 유지' : '기준 일정 유지' });
        continue;
      }
      const proposed = recommend(task, predecessor, holidays);
      if(!proposed){ retained.push({ id, title: task.title, reason: '선행 일정 미정 · 현재 일정 유지' }); continue; }
      const previousRecommendation = recommend(task, beforePredecessor, holidays);
      if(task.dateOverride || task.dateLocked || task.scheduleMode === 'manual'){
        if(same(previousRecommendation, proposed)) continue;
        const review = same(task, proposed) ? null : {
          sourceTaskId: rule.predecessorId,
          recommendedStartDate: proposed.startDate, recommendedDueDate: proposed.dueDate,
          reason: '선행 일정이 변경되었습니다.',
          conflict: task.startDate < proposed.startDate
        };
        changes.push({ id, title: task.title, kind: 'review', before: {startDate:task.startDate,dueDate:task.dueDate}, after: proposed, patch: { scheduleReview: review } });
        continue;
      }
      if(same(task, proposed)) continue;
      const patch = { ...proposed, scheduleStatus: 'scheduled', scheduleReview: null };
      changes.push({ id, title: task.title, kind: 'automatic', before: {startDate:task.startDate,dueDate:task.dueDate}, after: proposed, patch });
      effective.set(id, { ...task, ...patch });
    }
    return { rootId, changes, retained };
  }
  return { addWorkdays, previewChanges, recommendDates: recommend };
});
