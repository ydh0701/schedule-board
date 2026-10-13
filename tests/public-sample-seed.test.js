const test=require('node:test'),assert=require('node:assert/strict');
const {buildSampleWrites}=require('../public/tests/browser/share-seed');
const engine=require('../public/js/template-engine'),scheduler=require('../public/js/dependency-scheduler'),catalog=require('../public/docs/project-template-tables.json');
test('public sample uses four current PC snapshots and resolves all dependency dates',()=>{
 const writes=buildSampleWrites(catalog,engine,scheduler,'2026-10-13');
 const projects=writes.filter(w=>w.collection==='projects'),tasks=writes.filter(w=>w.collection==='tasks').map(w=>w.data),byId=new Map(tasks.map(t=>[t.id,t]));
 assert.equal(projects.length,4);assert.equal(tasks.length,328);
 for(const {data:p}of projects){assert.equal(p.stageSnapshots.length,7);assert.deepEqual(p.platforms,['pc']);assert.equal(tasks.filter(t=>t.projectId===p.id).length,82);}
 for(const t of tasks){assert.ok(t.startDate&&t.dueDate);for(const id of scheduler.dependencies(t))assert.equal(byId.get(id).projectId,t.projectId);if(t.datePolicy!=='anchor')assert.deepEqual({startDate:t.startDate,dueDate:t.dueDate},scheduler.recommendDates(t,scheduler.dependencies(t).map(id=>byId.get(id)),['2026-10-09']));}
});
