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
const guideDataManagement={tab:'major',project:'',query:'',archived:false};
function renderGuideDataManagement(main){
  if(!canManageProjects()){main.appendChild(el('p','guide-empty','관리 화면을 볼 권한이 없습니다.'));return;}
  const tabs=el('div','guide-page-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','데이터 관리 항목');
  [['major','주요 일정 관리'],['import','엑셀 이관'],['history','배정 이력']].forEach(([id,label])=>{const tab=button(label,guideDataManagement.tab===id?'active':'',()=>{guideDataManagement.tab=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(guideDataManagement.tab===id));tabs.appendChild(tab);});main.appendChild(tabs);
  if(guideDataManagement.tab==='history'){renderGuideAssignmentHistory(main);return;}
  guideDataManagement.tab==='major'?renderGuideMajorManagement(main):renderGuideImportManagement(main);
}
function renderGuideAssignmentHistory(main){
  const panel=el('section','panel'),picker=selectField('이력 조회 프로젝트',[['','프로젝트 선택'],...projects.map(project=>[project.id,`${project.code||''} ${project.name}`])]);
  picker.select.value=projects.some(project=>project.id===historyPage.projectId)?historyPage.projectId:'';
  picker.select.onchange=()=>{if(picker.select.value)loadAssignmentHistory(picker.select.value);else{historyRequest++;historyPage={projectId:'',status:'idle',items:[],cursor:null,hasMore:false,error:''};rerender();}};
  panel.append(picker.wrap);main.append(panel);
  if(!picker.select.value){panel.append(el('p','guide-empty','프로젝트를 선택하면 담당자 변경 이력을 확인할 수 있습니다.'));return;}
  const page=historyPage;
  if(page.status==='loading'){const loading=el('p','','이력을 불러오는 중…');loading.setAttribute('role','status');panel.append(loading);}
  if(page.error){const error=el('p','form-error',page.error);error.setAttribute('role','alert');panel.append(error,button('다시 시도','ghost',()=>loadAssignmentHistory(page.projectId,{more:page.hasMore})));}
  if(page.cached)panel.append(el('p','foot-note','기기에 저장된 이력입니다. 연결 후 새로고침해주세요.'));
  if(page.status==='ready'){const controls=el('div','guide-history-controls');controls.append(el('p','foot-note',`조회된 이력 ${page.items.length}건`),button('새로고침','ghost',()=>loadAssignmentHistory(page.projectId)));panel.append(controls);}
  panel.append(guideManagementTable(['담당자 변경','변경자','변경일','확인 사항'],page.items.map(item=>[`${item.previousAssigneeName||'미배정'} → ${item.nextAssigneeName||'미배정'}`,item.changedByName||'사용자',fmtDate(item.changedAt),item.warningLevel==='danger'?'과부하 경고 확인':'—'])));
  if(page.hasMore)panel.append(button('이전 이력 더 보기','ghost',()=>loadAssignmentHistory(page.projectId,{more:true})));
}
function renderGuideImportManagement(main){
  if(!canManageProjects()){main.appendChild(el('p','guide-empty','관리 화면을 볼 권한이 없습니다.'));return;}
  const panel=el('section','guide-dashboard-panel'),head=el('div','guide-dashboard-panel-head');
  const intro=el('div','guide-management-intro');intro.append(el('h2','','엑셀 이관'));
  head.append(intro,button('파일 가져오기','primary',openImportEditor));panel.appendChild(head);main.appendChild(panel);
  const imported=activeTasks().filter(task=>task.importBatchId),groups=new Map();
  imported.forEach(task=>{const id=task.importBatchId;if(!groups.has(id))groups.set(id,{source:task.importSource||'출처 미기록',count:0,projects:new Set()});const item=groups.get(id);item.count++;item.projects.add(task.projectId);});
  const status=el('section','guide-dashboard-panel guide-management-section');status.appendChild(el('h2','','이관된 업무 현황'));
  status.appendChild(guideManagementTable(['이관 묶음','원본 파일','프로젝트 수','현재 업무 수'],[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([id,item])=>[id,item.source,item.projects.size,item.count])));
  main.appendChild(status);
}
function guideMajorRows(state,records,projectRecords){
  const projectMap=new Map(projectRecords.map(project=>[project.id,project])),query=String(state.query||'').trim().toLocaleLowerCase();
  return records.filter(item=>{
    const project=projectMap.get(item.projectId);return project && Boolean(item.archivedAt)===Boolean(state.archived) &&
      (state.archived||project.status!=='archived') && (!state.project||item.projectId===state.project) &&
      (!query||[item.title,project.code,project.name].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
  }).slice().sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||String(a.title||'').localeCompare(String(b.title||''),'ko'));
}
function renderGuideMajorManagement(main){
  const state=guideDataManagement,tools=el('div','guide-detail-tools'),filters=el('div','guide-detail-filters'),target=el('div','guide-major-management');
  filters.append(guideSelect('주요 일정 프로젝트',[['','전체 프로젝트'],...projects.filter(project=>project.status!=='archived'||state.archived).map(project=>[project.id,project.code||project.name])],state.project,value=>{state.project=value;draw();}),
    guideSearch('주요 일정 검색',state.query,value=>{state.query=value;draw();}),
    guideSelect('주요 일정 목록',[['active','등록된 일정'],['archived','보관된 일정']],state.archived?'archived':'active',value=>{state.archived=value==='archived';state.project='';rerender();}));
  tools.append(filters,button('+ 일정 추가','primary',()=>openGuideMajorEditor(null,state.project)));main.append(tools,target);
  function draw(){
    target.replaceChildren();const rows=guideMajorRows(state,milestones,projects);
    const table=guideManagementTable(['프로젝트','주요 일정','날짜','플랫폼',state.archived?'복구':''],rows.map(item=>{
      const project=projects.find(project=>project.id===item.projectId),title=button(item.title,'guide-major-title',()=>state.archived?openGuideMajorRecovery(item):openGuideMajorEditor(item));title.title=item.title;
      return [project.code||project.name,title,dateOnly(item.dueDate)||'날짜 미정',item.version?platformName(item.version):'전체',state.archived?button('복구','ghost tiny',()=>openGuideMajorRecovery(item)):''];
    }));
    table.querySelectorAll('tbody tr').forEach((row,index)=>{if(!rows[index])return;row.classList.add('guide-major-management-row');row.onclick=event=>{if(event.target.closest('button,a,input,select'))return;state.archived?openGuideMajorRecovery(rows[index]):openGuideMajorEditor(rows[index]);};});target.appendChild(table);
  }draw();
}
function openGuideMajorEditor(item,selectedProject=''){
  if(!canManageProjects())return;
  // Existing anchor schedules keep their task-impact preview and recalculation policy.
  if(item?.anchorKey){openMilestoneEditor(item,item.projectId);return;}
  const {dialog,close}=openDialog(item?'주요 일정 수정':'주요 일정 추가'),form=el('form','form-grid');dialog.classList.add('guide-major-editor');
  const available=projects.filter(project=>project.status!=='archived'),project=selectField('프로젝트',[['','프로젝트 선택'],...available.map(project=>[project.id,project.code||project.name])]);project.select.value=item?.projectId||selectedProject;project.select.required=true;project.select.disabled=Boolean(item);
  const title=inputField('일정명','예: 스팀 페이지 오픈');title.input.value=item?.title||'';title.input.required=true;title.input.maxLength=120;
  const date=inputField('날짜','','date');date.input.value=dateOnly(item?.dueDate);date.input.required=true;
  const platform=selectField('플랫폼',[['','전체']]);
  function drawPlatforms(){const source=projects.find(value=>value.id===project.select.value),current=platform.select.value;platform.select.replaceChildren();[['','전체'],...[...new Set([...(source?.platforms||[]),...(item?.version?[item.version]:[])])].map(id=>[id,platformName(id)])].forEach(([id,label])=>{const option=el('option','',label);option.value=id;platform.select.appendChild(option);});platform.select.value=current;}
  drawPlatforms();platform.select.value=item?.version||'';project.select.onchange=drawPlatforms;
  const error=el('p','guide-major-error');error.setAttribute('role','alert');const actions=el('div','form-actions'),save=button('저장','primary');save.type='submit';
  if(item)actions.appendChild(button('보관','danger-button',()=>openGuideMajorArchive(item,close)));
  actions.append(button('취소','ghost',close),save);form.append(project.wrap,title.wrap,date.wrap,platform.wrap,error,actions);
  form.onsubmit=async event=>{event.preventDefault();if(save.disabled||!form.reportValidity())return;error.textContent='';
    if(!title.input.value.trim()){error.textContent='일정명을 입력해주세요.';title.input.focus();return;}
    if(!available.some(value=>value.id===project.select.value)){error.textContent='사용 가능한 프로젝트를 선택해주세요.';return;}
    const release=setDialogSaving(dialog,true);try{await saveMilestone({...item,expectedSignature:item?taskEditSignature(item):null,projectId:project.select.value,title:title.input.value,dueDate:date.input.value,version:platform.select.value||null});release();close(true);showToast('주요 일정을 저장했습니다.');}catch(cause){error.textContent=cause.message;}finally{release();}
  };mountDialogForm(dialog,form);protectDialogForm(form);
}
function openGuideMajorArchive(item,closeEditor){
  if(!canManageProjects())return;
  const {dialog,close}=openDialog('주요 일정 보관'),form=el('div','form-grid'),error=el('p','guide-major-error');error.setAttribute('role','alert');
  const linked=activeTasks().filter(task=>task.milestoneId===item.id).length;
  form.append(el('p','',item.title),el('p','guide-management-copy',`보관하면 대시보드에서 숨겨집니다. 보관된 일정에서 복구할 수 있습니다.${linked?' 연결된 업무 '+linked+'건은 삭제되지 않습니다.':''}`));
  const actions=el('div','form-actions'),save=button('보관','danger-button',async()=>{save.disabled=true;try{await archiveMilestone(item.id,taskEditSignature(item));close();closeEditor();showToast('주요 일정을 보관했습니다.');}catch(cause){error.textContent=cause.message;save.disabled=false;}});actions.append(button('취소','ghost',close),save);form.append(error,actions);mountDialogForm(dialog,form);
}
function openGuideMajorRecovery(item){
  if(!canManageProjects())return;
  const {dialog,close}=openDialog('주요 일정 복구'),form=el('div','form-grid'),error=el('p','guide-major-error');error.setAttribute('role','alert');
  form.append(el('p','',`${item.title} · ${dateOnly(item.dueDate)||'날짜 미정'}`));const actions=el('div','form-actions'),save=button('복구','primary',async()=>{save.disabled=true;try{await restoreMilestone(item.id,taskEditSignature(item));close();showToast('주요 일정을 복구했습니다.');}catch(cause){error.textContent=cause.message;save.disabled=false;}});actions.append(button('취소','ghost',close),save);form.append(error,actions);mountDialogForm(dialog,form);
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
    target.appendChild(el('p','guide-management-copy','조회 전용'));
    head.appendChild(el('span','guide-management-meta',`${catalog.platforms.find(item=>item.id===template.platformId)?.name||template.platformId} · ${template.status==='active'&&template.active!==false?'사용 중':'초안 또는 미사용'}`));
    const tabs=el('div','guide-page-tabs guide-management-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','템플릿 항목');
    [['stages','단계'],['tasks','기본 업무'],['rules','일정 연결 규칙']].forEach(([id,label])=>{const tab=button(label,state.tab===id?'active':'',()=>{state.tab=id;rerender();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(state.tab===id));tabs.appendChild(tab);});target.appendChild(tabs);
    const stages=catalog.templateStages.filter(item=>item.templateId===template.id).sort((a,b)=>a.order-b.order),tasks=catalog.templateTasks.filter(item=>item.templateId===template.id).sort((a,b)=>a.order-b.order);
    const stageName=id=>stages.find(item=>item.id===id)?.name||id,roleName=id=>catalog.roles.find(item=>item.id===id)?.name||id;
    if(state.tab==='stages')target.appendChild(guideManagementTable(['코드','단계명','순서','사용 여부'],stages.map(item=>[item.code,item.name,item.order,item.active===false?'미사용':'사용'])));
    else if(state.tab==='tasks')target.appendChild(guideManagementTable(['단계','직군','업무명','예상 작업일','생성 조건'],tasks.map(item=>[stageName(item.stageId),item.taskScope==='project'?'프로젝트 공통':roleName(item.roleId),item.title,item.defaultWorkdays,item.active===false?'미사용':item.creationPolicy==='on_request'?'요청 시':item.featureKey?'기능 선택 시':'기본'])));
    else {
      const name=id=>tasks.find(task=>task.id===id)?.title || id;
      const labels={after_task:'종료 다음 근무일',before_task:'기준일 이전 역산',during_task:'기준 기간 참여'};
      target.appendChild(guideManagementTable(['업무명','날짜 기준','연결 업무','간격(근무일)','마감 기준'],tasks.map(item=>[
        item.title,(item.datePolicy || catalog.roles.find(role=>role.id===item.roleId)?.datePolicy)==='anchor'?'고정 기준 일정':labels[item.ruleType || 'after_task'],
        window.ProjectTemplateEngine.dependencyIds(item).map(name).join(' · ') || '없음',item.startOffsetWorkdays ?? 1,
        (item.deadlines || []).map(rule=>name(rule.taskId)).join(' · ') || '없음'
      ])));
      const steps=tasks.flatMap(task=>(task.steps || []).map(step=>[task.title,step.title,(step.dependsOnTaskIds || []).map(name).join(' · '),step.workdays,(step.deadlines || []).map(rule=>name(rule.taskId)).join(' · ')]));
      if(steps.length){target.appendChild(el('h3','small-heading','업무 안의 후속 작업'));target.appendChild(guideManagementTable(['업무','후속 작업','연결 업무','작업일','마감 기준'],steps));}
    }
  }catch(error){if(target.isConnected)target.replaceChildren(el('p','guide-management-copy',`템플릿을 불러오지 못했습니다: ${error.message}`),button('다시 시도','ghost',()=>rerender()));}
}
