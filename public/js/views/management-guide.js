/* Management entry points. Import reuses validation/preview; template source stays read-only. */
const guideTemplateManagement={selected:'',tab:'stages'};
function guideActionMenu(label,items){
  const menu=el('details','guide-action-menu'),summary=el('summary','ghost tiny',label);summary.setAttribute('aria-label',label);menu.appendChild(summary);
  const choices=el('div','guide-action-choices');items.forEach(item=>choices.appendChild(button(item.label,item.className||'ghost',()=>{menu.open=false;item.action();})));menu.appendChild(choices);return menu;
}
function guideManagementTable(headers,rows){
  const wrap=el('div','guide-management-table-scroll'),table=el('table','guide-management-table'),head=el('thead',''),tr=el('tr','');
  const columns=headers.map(item=>typeof item==='string'?{label:item}:item);
  const cellClass=column=>column?.align==='right'?'guide-cell-right':column?.align==='center'?'guide-cell-center':'';
  columns.forEach(column=>{const th=el('th',cellClass(column),column.label);th.scope='col';tr.appendChild(th);});head.appendChild(tr);table.appendChild(head);
  const body=el('tbody','');rows.forEach(values=>{const row=el('tr','');values.forEach((value,index)=>{const cell=el('td',cellClass(columns[index]));if(value instanceof Node)cell.appendChild(value);else cell.textContent=String(value??'—');row.appendChild(cell);});body.appendChild(row);});
  if(!rows.length){const row=el('tr',''),cell=el('td','','등록된 항목이 없습니다.');cell.colSpan=headers.length;row.appendChild(cell);body.appendChild(row);}table.appendChild(body);wrap.appendChild(table);return wrap;
}
function renderGuideDataManagement(main){
  if(!canManageProjects()){main.appendChild(el('p','guide-empty','관리 화면을 볼 권한이 없습니다.'));return;}
  const panel=el('section','guide-dashboard-panel'),head=el('div','guide-dashboard-panel-head');
  const intro=el('div','guide-management-intro');intro.append(el('h2','','엑셀 이관'),el('p','guide-management-copy','엑셀·CSV 분석 → 열 연결·오류 확인 → 미리보기 → 이관. 미리보기만으로 저장되지 않습니다.'));
  head.append(intro,button('파일 가져오기','primary',openImportEditor));panel.appendChild(head);main.appendChild(panel);
  const imported=activeTasks().filter(task=>task.importBatchId),groups=new Map();
  imported.forEach(task=>{const id=task.importBatchId;if(!groups.has(id))groups.set(id,{source:task.importSource||'출처 미기록',count:0,projects:new Set()});const item=groups.get(id);item.count++;item.projects.add(task.projectId);});
  const status=el('section','guide-dashboard-panel guide-management-section');status.appendChild(el('h2','','이관된 업무 현황'));
  status.appendChild(guideManagementTable(['이관 묶음','원본 파일','프로젝트 수','현재 업무 수'],[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([id,item])=>[id,item.source,item.projects.size,item.count])));
  status.appendChild(el('p','guide-management-copy','현재 남아 있는 이관 업무를 기준으로 집계합니다. 삭제·보관된 업무나 실패한 이관 기록은 포함하지 않습니다. 오류는 파일 분석 화면에서 확인합니다.'));main.appendChild(status);
}
async function renderGuideTemplateManagement(main){
  if(!canManageProjects()){main.appendChild(el('p','guide-empty','관리 화면을 볼 권한이 없습니다.'));return;}
  const target=el('section','guide-dashboard-panel');target.appendChild(el('p','guide-management-copy','템플릿을 불러오는 중입니다.'));main.appendChild(target);
  try{
    const catalog=await loadProjectTemplateCatalog();if(!target.isConnected||activeView!=='templates')return;
    target.replaceChildren();const state=guideTemplateManagement;
    if(!catalog.templates.some(template=>template.id===state.selected))state.selected=catalog.templates[0]?.id||'';
    const template=catalog.templates.find(item=>item.id===state.selected);if(!template)return;
    const head=el('div','guide-dashboard-panel-head guide-template-head');head.append(el('h2','',template.name),guideSelect('템플릿 선택',catalog.templates.map(template=>[template.id,`${template.name} · v${template.version}`]),state.selected,value=>{state.selected=value;rerender();}));target.appendChild(head);
    target.appendChild(el('p','guide-management-copy','조회 전용 · 변경은 JSON 테이블에서 진행하며 기존 프로젝트는 생성 당시 구성을 유지합니다.'));
    head.appendChild(el('span','guide-management-meta',`${catalog.platforms.find(item=>item.id===template.platformId)?.name||template.platformId} · ${template.status==='active'&&template.active!==false?'사용 중':'초안 또는 미사용'}`));
    const tabs=el('div','guide-page-tabs guide-management-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','템플릿 항목');
    [['stages','단계'],['tasks','기본 업무'],['rules','일정 연결 규칙']].forEach(([id,label])=>{const tab=button(label,state.tab===id?'active':'',()=>{state.tab=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.tab===id));tabs.appendChild(tab);});target.appendChild(tabs);
    const stages=catalog.templateStages.filter(item=>item.templateId===template.id).sort((a,b)=>a.order-b.order),tasks=catalog.templateTasks.filter(item=>item.templateId===template.id).sort((a,b)=>a.order-b.order);
    const stageName=id=>stages.find(item=>item.id===id)?.name||id,roleName=id=>catalog.roles.find(item=>item.id===id)?.name||id;
    if(state.tab==='stages')target.appendChild(guideManagementTable(['코드','단계명','순서','사용 여부'],stages.map(item=>[item.code,item.name,item.order,item.active===false?'미사용':'사용'])));
    else if(state.tab==='tasks')target.appendChild(guideManagementTable(['단계','직군','업무명','예상 작업일','사용 여부'],tasks.map(item=>[stageName(item.stageId),roleName(item.roleId),item.title,item.defaultWorkdays,item.active===false?'미사용':'사용'])));
    else target.appendChild(guideManagementTable(['업무명','날짜 기준','연결된 선행 업무','시작 간격(근무일)'],tasks.map(item=>[item.title,item.datePolicy==='anchor'||catalog.roles.find(role=>role.id===item.roleId)?.datePolicy==='anchor'?'기준 일정':'연결 일정',item.dependsOnTaskId?tasks.find(task=>task.id===item.dependsOnTaskId)?.title||item.dependsOnTaskId:'없음',item.startOffsetWorkdays||0])));
  }catch(error){if(target.isConnected)target.replaceChildren(el('p','guide-management-copy',`템플릿을 불러오지 못했습니다: ${error.message}`),button('다시 시도','ghost',()=>rerender()));}
}
