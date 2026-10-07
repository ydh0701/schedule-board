/* Presentation assignments, separate from project records and business permissions. */
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MilestoneProjectColors=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const isReleased=project=>['archived','completed'].includes(project.status)||Boolean(project.archivedAt);
  function create({size,storage=null,key='milestone.projectColors.v1'}={}){
    if(!Number.isInteger(size)||size<1)throw new Error('Palette size must be positive.');
    const entries=new Map();
    try{
      const saved=JSON.parse(storage?.getItem(key)||'null');
      if(saved?.version===1&&Array.isArray(saved.entries))saved.entries.forEach(row=>{
        if(Array.isArray(row)&&typeof row[0]==='string'&&row[0]&&Number.isInteger(row[1])&&row[1]>=0&&row[1]<size&&typeof row[2]==='boolean')entries.set(row[0],{slot:row[1],active:row[2]});
      });
    }catch(_){} // Corrupt/disabled storage must not prevent rendering.
    function save(){try{storage?.setItem(key,JSON.stringify({version:1,entries:[...entries].map(([id,value])=>[id,value.slot,value.active])}));}catch(_){} }
    function reconcile(projects){
      let changed=false;
      projects.forEach(project=>{const entry=entries.get(project.id);if(!entry)return;const active=!isReleased(project);if(entry.active!==active){entry.active=active;changed=true;}});
      // Missing records may be filtered, loading, or permission scoped: never release them.
      if(changed)save();
    }
    function slot(project){
      if(!project||typeof project.id!=='string'||!project.id)throw new Error('Project ID is required.');
      if(entries.has(project.id))return entries.get(project.id).slot;
      const counts=Array(size).fill(0);entries.forEach(value=>{if(value.active)counts[value.slot]++;});
      const index=counts.indexOf(Math.min(...counts));
      entries.set(project.id,{slot:index,active:!isReleased(project)});save();return index;
    }
    return {slot,reconcile};
  }
  return {create};
});
