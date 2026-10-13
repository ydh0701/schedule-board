/*
 * template-engine.js — 플랫폼 템플릿을 검증하고 프로젝트 스냅샷으로 변환하는 순수 함수.
 * Firebase와 DOM에 의존하지 않아 브라우저, Node 테스트, 향후 관리자 도구에서 함께 쓸 수 있습니다.
 */
(function templateEngineModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProjectTemplateEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTemplateEngine() {
  const ACTIVE_TEMPLATE_STATUS = 'active';

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function dependencyIds(task) {
    return [...new Set([...rows(task?.dependsOnTaskIds), task?.dependsOnTaskId].filter(Boolean))];
  }

  function selectedTasks(tasks, input = {}) {
    const features = new Set(rows(input.featureKeys));
    const requests = new Set(rows(input.requestTaskKeys));
    return tasks.filter(task => task.active !== false
      && (!task.featureKey || features.has(task.featureKey))
      && (task.creationPolicy !== 'on_request' || requests.has(task.id)));
  }

  function uniqueErrors(tableName, tableRows) {
    const seen = new Set();
    const errors = [];
    tableRows.forEach((row, index) => {
      if (!nonEmpty(row?.id)) {
        errors.push(`${tableName}[${index}].id가 비어 있습니다.`);
        return;
      }
      if (seen.has(row.id)) errors.push(`${tableName}에 중복 ID가 있습니다: ${row.id}`);
      seen.add(row.id);
    });
    return errors;
  }

  function findDependencyCycle(tasks) {
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    const visiting = new Set();
    const visited = new Set();

    function visit(taskId, path) {
      if (visiting.has(taskId)) {
        const start = path.indexOf(taskId);
        return [...path.slice(start), taskId];
      }
      if (visited.has(taskId)) return null;
      visiting.add(taskId);
      let cycle = null;
      for (const dependencyId of dependencyIds(taskMap.get(taskId))) {
        if(taskMap.has(dependencyId)) cycle = visit(dependencyId, [...path, taskId]);
        if(cycle) break;
      }
      visiting.delete(taskId);
      visited.add(taskId);
      return cycle;
    }

    for (const task of tasks) {
      const cycle = visit(task.id, []);
      if (cycle) return cycle;
    }
    return null;
  }

  function validateTemplateCatalog(catalog) {
    const errors = [];
    if (!catalog || catalog.schemaVersion !== 2) errors.push('지원하는 템플릿 schemaVersion은 2입니다.');
    ['platforms', 'roles', 'templates', 'templateStages', 'templateTasks'].forEach(key => {
      if (!Array.isArray(catalog?.[key])) errors.push(`${key} 테이블이 필요합니다.`);
    });
    const warnings = [];
    const platforms = rows(catalog?.platforms);
    const roles = rows(catalog?.roles);
    const templates = rows(catalog?.templates);
    const stages = rows(catalog?.templateStages);
    const tasks = rows(catalog?.templateTasks);

    errors.push(...uniqueErrors('platforms', platforms));
    errors.push(...uniqueErrors('roles', roles));
    errors.push(...uniqueErrors('templates', templates));
    errors.push(...uniqueErrors('templateStages', stages));
    errors.push(...uniqueErrors('templateTasks', tasks));

    const platformIds = new Set(platforms.map(item => item.id));
    const roleIds = new Set(roles.map(item => item.id));
    const templateIds = new Set(templates.map(item => item.id));
    const stageMap = new Map(stages.map(item => [item.id, item]));
    const taskMap = new Map(tasks.map(item => [item.id, item]));
    roles.forEach(role => {
      if (!['internal_user', 'external_text'].includes(role.assignmentType)) errors.push(`직군 ${role.id}의 담당 방식이 올바르지 않습니다.`);
      if (role.datePolicy && !['anchor', 'automatic'].includes(role.datePolicy)) errors.push(`직군 ${role.id}의 일정 기준이 올바르지 않습니다.`);
    });

    templates.forEach(template => {
      if (!platformIds.has(template.platformId)) errors.push(`템플릿 ${template.id}의 플랫폼이 존재하지 않습니다: ${template.platformId}`);
      if (!Number.isInteger(template.version) || template.version < 1) errors.push(`템플릿 ${template.id}의 version은 1 이상의 정수여야 합니다.`);
    });

    stages.forEach(stage => {
      if (!templateIds.has(stage.templateId)) errors.push(`단계 ${stage.id}의 템플릿이 존재하지 않습니다: ${stage.templateId}`);
      if (!nonEmpty(stage.name)) errors.push(`단계 ${stage.id}의 이름이 비어 있습니다.`);
    });

    tasks.forEach(task => {
      const stage = stageMap.get(task.stageId);
      if (!templateIds.has(task.templateId)) errors.push(`업무 ${task.id}의 템플릿이 존재하지 않습니다: ${task.templateId}`);
      if (!stage) errors.push(`업무 ${task.id}의 단계가 존재하지 않습니다: ${task.stageId}`);
      else if (stage.templateId !== task.templateId) errors.push(`업무 ${task.id}와 단계 ${stage.id}의 템플릿이 다릅니다.`);
      if (task.active !== false && stage?.active === false) errors.push(`활성 업무 ${task.id}의 단계가 비활성 상태입니다.`);
      if (!roleIds.has(task.roleId)) errors.push(`업무 ${task.id}의 직군이 존재하지 않습니다: ${task.roleId}`);
      if (task.active !== false && roles.find(role => role.id === task.roleId)?.active === false) errors.push(`활성 업무 ${task.id}의 직군이 비활성 상태입니다.`);
      if (!nonEmpty(task.title)) errors.push(`업무 ${task.id}의 이름이 비어 있습니다.`);
      if (task.ruleType && !['after_task','before_task','during_task'].includes(task.ruleType)) errors.push(`업무 ${task.id}의 연결 방식이 올바르지 않습니다.`);
      if (task.datePolicy && !['anchor','automatic'].includes(task.datePolicy)) errors.push(`업무 ${task.id}의 날짜 정책이 올바르지 않습니다.`);
      if (!Number.isFinite(task.defaultWorkdays) || task.defaultWorkdays < 1) errors.push(`업무 ${task.id}의 기본 작업일은 1 이상이어야 합니다.`);
      if (task.referenceDate && !['startDate', 'dueDate'].includes(task.referenceDate)) errors.push(`업무 ${task.id}의 연결 날짜 기준이 올바르지 않습니다.`);
      if (!Number.isInteger(task.startOffsetWorkdays || 0)) errors.push(`업무 ${task.id}의 시작 간격은 정수 작업일이어야 합니다.`);
      if(task.ruleType==='during_task' && dependencyIds(task).length!==1) errors.push(`기간 참여 업무 ${task.id}는 기준 일정 하나가 필요합니다.`);
      if(task.ruleType==='before_task' && (!dependencyIds(task).length || Number(task.startOffsetWorkdays ?? -1)>=0)) errors.push(`역산 업무 ${task.id}는 기준 일정과 음수 간격이 필요합니다.`);
      for(const id of rows(task.participantRoleIds)){
        if(!roles.some(role=>role.id===id && role.assignmentType==='internal_user' && role.active!==false)) errors.push(`업무 ${task.id}의 참여 직군을 확인해주세요: ${id}`);
      }
      const validateDeadline=rule=>{
        if(rule.referenceDate && !['startDate','dueDate'].includes(rule.referenceDate)) errors.push(`업무 ${task.id}의 마감 날짜 기준을 확인해주세요.`);
        if(!Number.isInteger(rule.offsetWorkdays ?? -1)) errors.push(`업무 ${task.id}의 마감 간격은 정수 작업일이어야 합니다.`);
      };
      rows(task.deadlines).forEach(validateDeadline);
      const stepIds=new Set();
      rows(task.steps).forEach(step=>{
        if(!nonEmpty(step.id) || stepIds.has(step.id) || !nonEmpty(step.title) || !Number.isFinite(step.workdays) || step.workdays<1 || !rows(step.dependsOnTaskIds).length) errors.push(`업무 ${task.id}의 후속 작업 정의를 확인해주세요.`);
        stepIds.add(step.id);rows(step.deadlines).forEach(validateDeadline);
      });
      for (const dependencyId of dependencyIds(task)) {
        const dependency = taskMap.get(dependencyId);
        if (!dependency) errors.push(`업무 ${task.id}의 선행 업무가 존재하지 않습니다: ${dependencyId}`);
        else if (dependency.templateId !== task.templateId) errors.push(`업무 ${task.id}의 선행 업무는 같은 템플릿에 있어야 합니다.`);
        if (task.active !== false && dependency?.active === false) errors.push(`활성 업무 ${task.id}의 선행 업무가 비활성 상태입니다.`);
        if (dependencyId === task.id) errors.push(`업무 ${task.id}는 자기 자신을 선행 업무로 지정할 수 없습니다.`);
      }
      const extraRefs = [...rows(task.readinessTaskIds), ...rows(task.deadlines).map(rule=>rule.taskId), ...rows(task.steps).flatMap(step=>[...rows(step.dependsOnTaskIds), ...rows(step.deadlines).map(rule=>rule.taskId)])];
      extraRefs.forEach(id=>{
        const target=taskMap.get(id);
        if(!target || target.templateId!==task.templateId || (task.active!==false && target.active===false)) errors.push(`업무 ${task.id}의 마감/세부 작업 연결을 확인해주세요: ${id}`);
      });
    });

    templates.forEach(template => {
      const templateTasks = tasks.filter(task => task.templateId === template.id && task.active !== false);
      const cycle = findDependencyCycle(templateTasks);
      if (cycle) errors.push(`템플릿 ${template.id}의 업무 연결이 순환합니다: ${cycle.join(' → ')}`);
      if (!stages.some(stage => stage.templateId === template.id && stage.active !== false)) warnings.push(`템플릿 ${template.id}에 활성 단계가 없습니다.`);
      if (!templateTasks.length) warnings.push(`템플릿 ${template.id}에 활성 업무가 없습니다.`);
    });

    const activeByPlatform = new Map();
    templates.filter(template => template.active !== false && template.status === ACTIVE_TEMPLATE_STATUS).forEach(template => {
      const previous = activeByPlatform.get(template.platformId);
      if (previous) errors.push(`플랫폼 ${template.platformId}에 활성 템플릿이 둘 이상입니다: ${previous}, ${template.id}`);
      activeByPlatform.set(template.platformId, template.id);
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  function assertValidCatalog(catalog) {
    const result = validateTemplateCatalog(catalog);
    if (!result.valid) {
      const error = new Error(`템플릿 데이터가 올바르지 않습니다.\n- ${result.errors.join('\n- ')}`);
      error.code = 'INVALID_TEMPLATE_CATALOG';
      error.details = result;
      throw error;
    }
    return result;
  }

  function getTemplateForPlatform(catalog, platformId, options = {}) {
    assertValidCatalog(catalog);
    const template = rows(catalog.templates)
      .filter(item => item.platformId === platformId && item.active !== false)
      .filter(item => options.allowDraft || item.status === ACTIVE_TEMPLATE_STATUS)
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
    if (!template) throw new Error(`사용 가능한 ${platformId} 플랫폼 템플릿이 없습니다.`);
    const stages = rows(catalog.templateStages)
      .filter(item => item.templateId === template.id && item.active !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const tasks = rows(catalog.templateTasks)
      .filter(item => item.templateId === template.id && item.active !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    return { template, stages, tasks };
  }

  function defaultIdFactory(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeAssignments(assignments) {
    return new Map(rows(assignments).filter(item => nonEmpty(item?.roleId)).map(item => [item.roleId, item]));
  }

  function validateCreateInput(catalog, input, selectedTemplates) {
    const errors = [];
    if (!nonEmpty(input?.name)) errors.push('프로젝트명을 입력해주세요.');
    if (!nonEmpty(input?.code)) errors.push('프로젝트 코드를 입력해주세요.');
    if (!selectedTemplates.length) errors.push('플랫폼을 하나 이상 선택해주세요.');
    const roleMap = new Map(rows(catalog.roles).map(role => [role.id, role]));
    const assignments = normalizeAssignments(input?.assignments);
    const seenRoles = new Set();
    rows(input?.assignments).forEach(assignment => {
      if (!roleMap.has(assignment?.roleId)) errors.push('존재하지 않는 담당 직군입니다.');
      if (seenRoles.has(assignment?.roleId)) errors.push(`직군 ${assignment.roleId}의 담당자가 중복 지정되었습니다.`);
      seenRoles.add(assignment?.roleId);
    });
    const requiredRoleIds = new Set(selectedTemplates.flatMap(item => item.tasks.map(task => task.roleId)));
    requiredRoleIds.forEach(roleId => {
      const role = roleMap.get(roleId);
      const assignment = assignments.get(roleId);
      if (!role || !assignment) {
        errors.push(`${role?.name || roleId} 담당 정보를 입력해주세요.`);
        return;
      }
      if (role.assignmentType === 'internal_user' && !nonEmpty(assignment.userId)) errors.push(`${role.name} 담당자를 선택해주세요.`);
      if (role.assignmentType === 'external_text' && !nonEmpty(assignment.externalName)) errors.push(`${role.name} 업체명을 입력해주세요.`);
    });
    if (errors.length) {
      const error = new Error(errors.join('\n'));
      error.code = 'INVALID_PROJECT_INPUT';
      error.details = { errors };
      throw error;
    }
  }

  function buildProjectSnapshot(catalog, input, options = {}) {
    assertValidCatalog(catalog);
    const platformIds = [...new Set(rows(input?.platformIds || input?.platforms))];
    const selectedTemplates = platformIds.map(platformId => {
      const selection = getTemplateForPlatform(catalog, platformId, options);
      return {...selection, tasks:selectedTasks(selection.tasks, input)};
    });
    validateCreateInput(catalog, input, selectedTemplates);

    const idFactory = options.idFactory || defaultIdFactory;
    const projectId = input.id || idFactory('project');
    const assignments = normalizeAssignments(input.assignments);
    const roleMap = new Map(rows(catalog.roles).map(role => [role.id, role]));
    const stageIdMap = new Map();
    const taskIdMap = new Map();
    const projectStages = [];
    const projectTasks = [];

    selectedTemplates.forEach(({ template, stages, tasks }) => {
      stages.forEach(stage => {
        const id = idFactory('stage');
        stageIdMap.set(`${template.id}:${stage.id}`, id);
        projectStages.push({
          id,
          projectId,
          platform: template.platformId,
          sourceStageId: stage.id,
          templateId: template.id,
          templateVersion: template.version,
          code: stage.code || null,
          name: stage.name,
          order: Number(stage.order || 0),
          active: true
        });
      });
      tasks.forEach(task => taskIdMap.set(`${template.id}:${task.id}`, idFactory('task')));
      tasks.forEach(task => {
        const role = roleMap.get(task.roleId);
        const assignment = assignments.get(task.roleId);
        const internal = role.assignmentType === 'internal_user';
        const assigneeId = internal ? assignment.userId : null;
        const participantIds = [...new Set([assigneeId, ...rows(task.participantRoleIds).map(id=>assignments.get(id)?.userId)].filter(Boolean))];
        const dependencies = dependencyIds(task).map(id => taskIdMap.get(`${template.id}:${id}`)).filter(Boolean);
        const dependencyId = dependencies[0] || null;
        const ruleType = task.ruleType || 'after_task';
        const scheduleRule = dependencies.length ? {
          type: ruleType, predecessorId: dependencyId, predecessorIds: dependencies,
          referenceDate: task.referenceDate || (ruleType === 'before_task' ? 'startDate' : 'dueDate'),
          offsetWorkdays: Number(task.startOffsetWorkdays ?? (ruleType === 'before_task' ? -1 : 1))
        } : null;
        const remapDeadline = rule => ({...rule,taskId:taskIdMap.get(`${template.id}:${rule.taskId}`)});
        const scheduleSteps = rows(task.steps).map(step=>({
          id:step.id,title:step.title,estimatedDays:Number(step.workdays || 1),
          scheduleRule:{type:'after_task',predecessorIds:rows(step.dependsOnTaskIds).map(id=>taskIdMap.get(`${template.id}:${id}`)).filter(Boolean),referenceDate:'dueDate',offsetWorkdays:1},
          deadlineRules:rows(step.deadlines).map(remapDeadline)
        }));
        projectTasks.push({
          id: taskIdMap.get(`${template.id}:${task.id}`),
          projectId,
          platform: template.platformId,
          stageId: stageIdMap.get(`${template.id}:${task.stageId}`),
          phaseId: stageIdMap.get(`${template.id}:${task.stageId}`),
          departmentId: task.roleId,
          title: task.title,
          assigneeId,
          assigneeIds: participantIds,
          assignees: participantIds.map((userId,index)=>({userId,share:1/participantIds.length,role:index===0?'primary':'co'})),
          externalAssigneeName: internal ? null : assignment.externalName.trim(),
          supporterIds: rows(task.participantRoleIds).map(id=>assignments.get(id)?.userId).filter(id=>id && id!==assigneeId),
          parentTaskId: null,
          startDate: null,
          dueDate: null,
          status: 'todo',
          scheduleStatus: 'unscheduled',
          progress: 0,
          estimatedDays: Number(task.defaultWorkdays),
          dependsOn: dependencies,
          readinessDependsOn: rows(task.readinessTaskIds).map(id=>taskIdMap.get(`${template.id}:${id}`)).filter(Boolean),
          scheduleRule,
          deadlineRules: rows(task.deadlines).map(remapDeadline),
          scheduleSteps,
          scheduleStepDates: {},
          taskScope: task.taskScope || 'role',
          durationSource: task.durationSource || 'temporary',
          featureKey: task.featureKey || null,
          datePolicy: task.datePolicy || role.datePolicy || 'automatic',
          generated: true,
          sourceType: 'template',
          templateKey: task.id,
          templateTaskId: task.id,
          templateId: template.id,
          templateVersion: template.version,
          dateLocked: false,
          order: Number(task.order || 0),
          archivedAt: null
        });
      });
    });

    const projectAssignments = [...assignments.values()].map(assignment => {
      const role = roleMap.get(assignment.roleId);
      return {
        departmentId: assignment.roleId,
        assignmentType: role.assignmentType,
        assigneeId: role.assignmentType === 'internal_user' ? assignment.userId : null,
        externalAssigneeName: role.assignmentType === 'external_text' ? assignment.externalName.trim() : null
      };
    });
    const templateRefs = selectedTemplates.map(({ template }) => ({ id: template.id, platformId: template.platformId, version: template.version }));
    return {
      project: {
        id: projectId,
        name: input.name.trim(),
        code: input.code.trim(),
        platforms: platformIds,
        versions: platformIds,
        platformId: platformIds.length === 1 ? platformIds[0] : null,
        templateRefs,
        templateId: templateRefs.length === 1 ? templateRefs[0].id : null,
        templateVersion: templateRefs.length === 1 ? templateRefs[0].version : null,
        stageSnapshots: projectStages,
        roleSnapshots: rows(catalog.roles).filter(role => assignments.has(role.id)).map(role => ({ ...role })),
        staffing: platformIds.flatMap(platform => projectAssignments
          .filter(item => item.assignmentType === 'internal_user')
          .map(item => ({ platform, departmentId: item.departmentId, userId: item.assigneeId }))),
        projectAssignments,
        participantDepartmentIds: [...new Set(projectAssignments.filter(item=>item.assignmentType==='internal_user').map(item=>item.departmentId))],
        managerIds: [...new Set(rows(input.managerIds).filter(Boolean))],
        observerIds: [...new Set(rows(input.observerIds).filter(Boolean))],
        schedulingMode: 'template_v2',
        status: 'active',
        health: 'on_track',
        featureKeys: rows(input.featureKeys), requestTaskKeys: rows(input.requestTaskKeys)
      },
      projectStages,
      tasks: projectTasks
    };
  }

  function createProjectWritePlan(snapshot) {
    if (!snapshot?.project?.id) throw new Error('프로젝트 스냅샷이 필요합니다.');
    const writes = [{ collection: 'projects', id: snapshot.project.id, data: snapshot.project }];
    rows(snapshot.tasks).forEach(task => writes.push({ collection: 'tasks', id: task.id, data: task }));
    const memberships = new Map();
    rows(snapshot.project.projectAssignments)
      .filter(item => item.assignmentType === 'internal_user' && item.assigneeId)
      .forEach(item => {
        const previous = memberships.get(item.assigneeId) || { departmentIds: [] };
        memberships.set(item.assigneeId, { departmentIds: [...new Set([...previous.departmentIds, item.departmentId])] });
      });
    [...rows(snapshot.project.managerIds),...rows(snapshot.project.observerIds)].forEach(userId=>{if(!memberships.has(userId))memberships.set(userId,{departmentIds:[]});});
    memberships.forEach((membership, userId) => writes.push({
        collection: 'projectMembers',
        id: `${snapshot.project.id}_${userId}`,
        merge: true,
        data: { projectId: snapshot.project.id, userId, departmentIds: membership.departmentIds, platforms: snapshot.project.platforms }
      }));
    return writes;
  }

  function defaultProjectPeople(users){
    const active=rows(users).filter(user=>user.active);
    const managerIds=[...new Set(active.filter(user=>user.isAdmin||['admin','pm'].includes(user.role)).map(user=>user.id).filter(Boolean))];
    const observerIds=[...new Set(active.filter(user=>user.role==='lead'&&!managerIds.includes(user.id)).map(user=>user.id).filter(Boolean))];
    return {managerIds,observerIds};
  }
  return {
    validateTemplateCatalog,
    assertValidCatalog,
    getTemplateForPlatform,
    buildProjectSnapshot,
    createProjectWritePlan,
    selectedTasks, dependencyIds, defaultProjectPeople
  };
});
