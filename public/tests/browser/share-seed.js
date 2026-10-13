/* Public synthetic fixture built from the SAME PC catalog and engine as new projects. */
(function(root){
  const VERSION='pc-v3-20261013';
  function buildSampleWrites(catalog,engine,scheduler,today){
    const anchors={project_kickoff:[0,0],partner_concept:[-5,-1],partner_budget:[1,3],partner_treatment_delivery:[4,10],partner_shoot_preparation:[11,15],partner_shoot:[16,20],partner_rough_cut_delivery:[21,25],partner_photo_originals:[21,25],partner_reward_retouch_1:[35,39],partner_ui_retouch_1:[43,47],partner_demo_video:[40,50],partner_full_video:[60,75],qa_demo_review:[65,69],project_demo_review_build:[69,69],project_demo_submission:[70,70],project_demo_launch_qa:[75,79],project_demo_launch_build:[79,79],project_demo_release:[80,80],project_full_review_qa:[100,104],project_full_review_build:[104,104],project_full_submission:[105,105],qa_release:[110,114],project_full_launch_build:[114,114],project_full_release:[115,115]};
    const holidays=['2026-10-09'];
    const writes=[];
    ['샘플 펜싱 프로젝트','샘플 드라마 프로젝트','샘플 생존 프로젝트','샘플 완료 프로젝트'].forEach((name,index)=>{
      const id='sample_pc_v3_'+(index+1);let sequence=0;
      const snapshot=engine.buildProjectSnapshot(catalog,{id,name,code:'SAMPLE0'+(index+1),platformIds:['pc'],assignments:[
        ...[['planning','planning_01'],['ui','ui_01'],['development','dev_01'],['qa','qa_01'],['business','business_01']].map(([roleId,userId])=>({roleId,userId})),
        {roleId:'video_partner',externalName:'샘플 영상사'}
      ]},{idFactory:prefix=>id+'_'+prefix+'_'+(++sequence)});
      const kickoff=scheduler.addWorkdays(today,index===3?-180:-30+index*5,holidays);
      for(const task of snapshot.tasks){
        if(task.datePolicy!=='anchor')continue;
        const offsets=anchors[task.templateKey];
        if(!offsets)throw new Error('샘플 기준 날짜 누락: '+task.templateKey);
        task.startDate=scheduler.addWorkdays(kickoff,offsets[0],holidays);
        task.dueDate=scheduler.addWorkdays(kickoff,offsets[1],holidays);
        task.scheduleStatus='scheduled';
      }
      const byId=new Map(snapshot.tasks.map(task=>[task.id,task]));
      // Resolve all multi-predecessor, backwards TC and period-participation rules.
      for(let pass=0;pass<snapshot.tasks.length;pass++){
        let changed=false;
        for(const task of snapshot.tasks){
          if(task.datePolicy==='anchor'||task.startDate||!task.scheduleRule)continue;
          const predecessors=scheduler.dependencies(task).map(id=>byId.get(id));
          const dates=scheduler.recommendDates(task,predecessors,holidays);
          if(dates){Object.assign(task,dates,{scheduleStatus:'scheduled'});changed=true;}
        }
        if(!changed)break;
      }
      for(const task of snapshot.tasks){
        if(!task.startDate||!task.dueDate)throw new Error('샘플 자동 날짜 미계산: '+task.templateKey);
        for(const step of task.scheduleSteps||[]){
          const dates=scheduler.recommendDates({estimatedDays:step.estimatedDays||1,scheduleRule:step.scheduleRule},scheduler.dependencies({scheduleRule:step.scheduleRule}).map(id=>byId.get(id)),holidays);
          if(dates)task.scheduleStepDates={...task.scheduleStepDates,[step.id]:dates};
        }
        const completed=index===3||task.dueDate<today;
        task.status=completed?'done':task.startDate<=today?'in_progress':'todo';task.progress=completed?100:task.status==='in_progress'?40:0;
        if(completed)task.completedAt=task.dueDate+'T09:00:00+09:00';
      }
      Object.assign(snapshot.project,{status:index===3?'completed':'active',sampleFixtureVersion:VERSION});
      writes.push(...engine.createProjectWritePlan(snapshot));
    });
    return writes;
  }
  if(typeof module==='object'&&module.exports){module.exports={buildSampleWrites,VERSION};return;}
  let pending;
  root.seedOfficeTestData=function(reset=false){
    if(pending)return pending;
    if(root.testStore.size&&!reset)return Promise.resolve();
    pending=(async()=>{
      const response=await fetch('docs/project-template-tables.json',{cache:'no-store'});
      if(!response.ok)throw new Error('샘플 템플릿을 불러오지 못했습니다.');
      const catalog=await response.json();
      const today=new Date(),key=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
      const writes=buildSampleWrites(catalog,root.ProjectTemplateEngine,root.DependencyScheduler,key);
      // Only this versioned browser-only sample store is replaced. Old browser storage is retained.
      root.testStore.clear();
      for(const write of writes)root.testStore.set(write.collection+'/'+write.id,write.data);
      for(const user of typeof visibleUsers!=='undefined'?visibleUsers:[]){const {id,...data}=user;root.testStore.set('users/'+id,data);}
      root.persistTestStore();root.refreshTestData?.();
    })().catch(error=>{if(typeof showToast==='function')showToast(error.message);throw error;}).finally(()=>{pending=null;});
    return pending;
  };
  root.sampleSeedReady=root.seedOfficeTestData();
})(typeof globalThis!=='undefined'?globalThis:this);
