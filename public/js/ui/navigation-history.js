/* URL/history owns navigation only; task data and editors remain untouched. */
(function(root){
  const views=new Set(['home','projects','my-work','people','data','templates','admin']);
  function normalize(route,allowed=()=>true){
    let view=route?.view==='work'?'my-work':route?.view==='team'?'people':route?.view;
    if(!views.has(view)||!allowed(view))view='home';
    return {view,projectId:view==='projects'&&typeof route?.projectId==='string'?route.projectId:null,
      list:view==='projects'&&route?.list==='completed'?'completed':'active',stage:view==='projects'&&route?.projectId?String(route.stage||''):''};
  }
  function decode(hash,allowed){const params=new URLSearchParams(String(hash||'').replace(/^#/,''));return normalize({view:params.get('view')||'home',projectId:params.get('project'),list:params.get('list'),stage:params.get('stage')},allowed);}
  function encode(route){const r=normalize(route),params=new URLSearchParams({view:r.view});if(r.view==='projects'){if(r.list==='completed')params.set('list',r.list);if(r.projectId)params.set('project',r.projectId);if(r.stage)params.set('stage',r.stage);}return '#'+params.toString();}
  function createRouter({location,history,capture,restore,render,allowed=()=>true,listen}){
    let ready=false,restoring=false;
    const url=route=>location.pathname+location.search+encode(route);
    function initialize(){if(ready)return;ready=true;const route=decode(location.hash,allowed);restore(route);history.replaceState({milestoneRoute:route},'',url(route));}
    function sync(){if(!ready||restoring)return;const route=normalize(capture(),allowed);const hash=encode(route);if(hash!==location.hash)history.pushState({milestoneRoute:route},'',url(route));}
    function backOrForward(){if(!ready)return;restoring=true;try{const route=decode(location.hash,allowed);restore(route);render();const actual=normalize(capture(),allowed);history.replaceState({milestoneRoute:actual},'',url(actual));}finally{restoring=false;}}
    listen('popstate',backOrForward);listen('hashchange',backOrForward);
    return {initialize,sync};
  }
  const api={normalize,decode,encode,createRouter};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    root.MilestoneNavigation=api;
    let router;
    const allowed=view=>view==='admin'?isAdmin():['data','templates'].includes(view)?canManageProjects():view==='people'?isLead()||isPM()||isAdmin():true;
    root.prepareMilestoneNavigation=()=>{
      if(!router){router=createRouter({location:root.location,history:root.history,allowed,listen:(type,fn)=>root.addEventListener(type,fn),render:()=>rerender(),
        capture:()=>({view:activeView,projectId:selectedProjectId,list:guideProjectView.list,stage:selectedProjectId?guideProjectView.detail.get(selectedProjectId)?.stage||'':''}),
        restore:route=>{activeView=route.view;selectedProjectId=route.projectId;guideProjectView.list=route.list;guideProjectView.originProject=route.projectId;if(route.projectId){guideDetailState(route.projectId).stage=route.stage;}}
      });router.initialize();}
      if(!allowed(activeView)){activeView='home';selectedProjectId=null;}
    };
    root.syncMilestoneNavigation=()=>router?.sync();
  }
})(typeof window!=='undefined'?window:globalThis);
