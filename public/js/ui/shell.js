/* Navigation labels and access predicates are kept in one editable table. */
const MILESTONE_NAVIGATION = [
  {id:'home',label:'대시보드',icon:'dashboard',section:'업무 공간',visible:()=>true},
  {id:'projects',label:'프로젝트 현황',icon:'projects',visible:()=>true},
  {id:'my-work',label:'개인 일정',icon:'calendar',visible:()=>true},
  {id:'people',label:'팀별 현황',icon:'people',visible:()=>isLead()||isPM()||isAdmin()},
  {id:'data',label:'데이터 관리',icon:'projects',section:'관리',parent:'settings',visible:()=>canManageProjects()},
  {id:'templates',label:'프로젝트 템플릿',icon:'settings',parent:'settings',visible:()=>canManageProjects()},
  {id:'admin',label:'구성원 · 권한',icon:'settings',parent:'settings',visible:()=>isAdmin()}
];
const MILESTONE_NAV_GROUPS={settings:{label:'관리자 설정',icon:'settings'}};
const milestoneNavGroupState={settings:true};
const MILESTONE_ICONS={
  dashboard:'M3 12a9 9 0 0 1 18 0v6H3z M12 12l4-4 M6 12h1 M17 12h1',
  projects:'M4 3h16v18H4z M8 7h8 M8 12h8 M8 17h8',
  calendar:'M3 5h18v16H3z M3 10h18 M7 3v4 M17 3v4 M7 14h2 M13 14h2',
  people:'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M15 5a3 3 0 0 1 0 6 M3 21v-3a6 6 0 0 1 12 0v3 M17 14a5 5 0 0 1 4 5v2',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M8 3h8l1 4 4 1v8l-4 1-1 4H8l-1-4-4-1V8l4-1z',
  plus:'M12 4v16 M4 12h16', collapse:'M3 4h18v16H3z M8 4v16',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6'
};
function milestoneIcon(name){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.7');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',MILESTONE_ICONS[name]||MILESTONE_ICONS.projects);icon.appendChild(path);return icon;
}
function renderMilestoneNavigation(nav){
  nav.innerHTML='';
  if(!currentProfile || !isApproved()) return;
  MILESTONE_NAVIGATION.filter(item=>item.visible()).forEach(item=>{
    if(item.section) nav.appendChild(el('p','sidebar-section',item.section));
    let parent=nav;
    if(item.parent){
      parent=nav.querySelector(`[data-nav-group="${item.parent}"]`);
      if(!parent){
        parent=el('details','sidebar-group');parent.dataset.navGroup=item.parent;parent.open=milestoneNavGroupState[item.parent]!==false;parent.ontoggle=()=>{milestoneNavGroupState[item.parent]=parent.open;};
        const group=MILESTONE_NAV_GROUPS[item.parent],summary=el('summary','sidebar-link');summary.append(milestoneIcon(group.icon),el('span','',group.label));parent.appendChild(summary);nav.appendChild(parent);
        summary.setAttribute('aria-label',group.label);summary.title=group.label;
      }
    }
    const link=button('','sidebar-link'+(item.parent?' sidebar-child':'')+(activeView===item.id?' active':''),item.action || (()=>setView(item.id)));
    link.setAttribute('aria-label',item.label);link.title=item.label;
    if(activeView===item.id) link.setAttribute('aria-current','page');
    link.append(milestoneIcon(item.icon),el('span','',item.label));parent.appendChild(link);
  });
  const collapse=document.getElementById('sidebarCollapse');
  if(collapse) {
    collapse.replaceChildren(milestoneIcon('collapse'));
    collapse.setAttribute('aria-controls','primaryNav');
    collapse.setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-collapsed')));
    collapse.onclick=()=>{document.body.classList.toggle('sidebar-collapsed');collapse.setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-collapsed')));};
  }
  const title=document.getElementById('pageTitle');
  if(title) title.textContent=MILESTONE_NAVIGATION.find(item=>item.id===activeView)?.label || '프로젝트 현황';
}
/* One viewport budget for all timeline lists; no screen-specific magic offsets. */
function guideFitScrollAreas(){
  document.querySelectorAll('#main .guide-gantt-scroll').forEach(target=>{
    const top=target.getBoundingClientRect().top+window.scrollY;
    target.style.maxHeight=`${Math.max(180,window.innerHeight-top-48)}px`;
    target.style.minHeight='180px';
  });
  document.querySelectorAll('#main .guide-dashboard-calendar').forEach(target=>{
    const weeks=target.querySelectorAll('.guide-dashboard-week').length;if(!weeks)return;
    const header=target.querySelector('.guide-dashboard-weekdays').getBoundingClientRect().height;
    const available=window.innerHeight-target.getBoundingClientRect().top-window.scrollY-header-64;
    target.style.setProperty('--calendar-week-height',`${Math.max(80,available/weeks)}px`);
  });
}
/* Tool dialogs float over content instead of inserting rows above the calendar. */
function positionGuidePopover(dialog,anchor){
  const overlay=dialog.closest('.modal-backdrop');overlay.classList.add('guide-popover-backdrop');dialog.classList.add('guide-popover');
  const rect=anchor.getBoundingClientRect(),width=Math.min(360,window.innerWidth-36);
  dialog.style.width=`${width}px`;
  dialog.style.left=`${Math.max(18,Math.min(window.innerWidth-width-18,rect.right-width))}px`;
  dialog.style.top=`${Math.max(18,Math.min(rect.bottom+8,window.innerHeight-dialog.getBoundingClientRect().height-18))}px`;
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
  const main=document.getElementById('main');if(!main)return;
  let scheduled=false;
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;guideFitScrollAreas();});};
  new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);schedule();
});
