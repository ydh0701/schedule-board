/* Local import editing contract: stable IDs, validated fields, immutable source. */
(function(root){
  const fields=['title','stageId','departmentId','startDate','dueDate','status','progress'];
  function exportRows(tasks){return tasks.map(task=>Object.fromEntries(['id',...fields].map(key=>[key,task[key]??null])));}
  function validDate(value){
    if(value===null)return true;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
  }
  function applyRows(data,rows){
    if(!Array.isArray(rows))throw new Error('업무 테이블은 행 배열이어야 합니다.');
    const ids=new Set(),byId=new Map(data.tasks.map(task=>[task.id,task])),updates=new Map();
    const stages=new Set(data.project.stageSnapshots.map(stage=>stage.id)),roles=new Set(data.project.roleSnapshots.map(role=>role.id));
    rows.forEach((row,index)=>{
      const fail=message=>{throw new Error(`${index+1}행 (${row?.id||'ID 없음'}): ${message}`);};
      if(!row||typeof row!=='object'||!byId.has(row.id))fail('기존 업무 ID를 유지해주세요.');
      if(ids.has(row.id))fail('업무 ID 중복');ids.add(row.id);
      if(Object.keys(row).some(key=>!['id',...fields].includes(key)))fail('허용되지 않은 열');
      const next={...byId.get(row.id)};fields.forEach(key=>{if(Object.hasOwn(row,key))next[key]=row[key];});
      if(typeof next.title!=='string'||!next.title.trim())fail('업무명 필요');next.title=next.title.trim();
      if(!stages.has(next.stageId))fail('존재하지 않는 단계');
      if(!roles.has(next.departmentId))fail('존재하지 않는 직군');
      if(!validDate(next.startDate)||!validDate(next.dueDate))fail('날짜는 YYYY-MM-DD 또는 null');
      if(next.startDate&&next.dueDate&&next.startDate>next.dueDate)fail('마감일은 시작일보다 빠를 수 없습니다.');
      if(!['todo','in_progress','blocked','done'].includes(next.status))fail('상태 값 오류');
      if(typeof next.progress!=='number'||!Number.isFinite(next.progress)||next.progress<0||next.progress>100)fail('진척률은 0~100');
      if(next.status==='done'&&next.progress!==100)fail('완료 업무 진척률은 100');
      updates.set(row.id,next);
    });
    return {...data,tasks:data.tasks.map(task=>updates.get(task.id)||{...task})};
  }
  const api={exportRows,applyRows,validDate};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ActualTaskTable=api;
})(typeof window!=='undefined'?window:globalThis);
