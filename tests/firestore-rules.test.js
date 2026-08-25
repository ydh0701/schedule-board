const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

const projectId = 'fmv-schedule-rules-test';
let env;

const user = (uid, data) => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'users', uid), { active: true, ...data });
});

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await user('admin', { role: 'admin', isAdmin: true, departmentId: 'planning' });
  await user('pm', { role: 'pm', departmentId: 'planning' });
  await user('lead-ui', { role: 'lead', departmentId: 'ui' });
  await user('member-ui', { role: 'member', departmentId: 'ui' });
  await user('member-dev', { role: 'member', departmentId: 'dev' });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'projects', 'p1'), { name: '테스트 프로젝트' });
    await setDoc(doc(db, 'tasks', 'task-ui'), {
      title: 'UI 업무', projectId: 'p1', departmentId: 'ui', assigneeId: 'member-ui',
      assigneeIds: ['member-ui'], assignees: [{ userId: 'member-ui' }], needsAssignment: false,
      status: 'todo', progress: 0, dueDate: '2026-09-01',
    });
  });
});

test.after(async () => { await env.cleanup(); });

test('비승인 사용자는 프로젝트를 읽을 수 없다', async () => {
  const db = env.authenticatedContext('outsider', {}).firestore();
  await assertFails(getDoc(doc(db, 'projects', 'p1')));
});

test('PM은 프로젝트를 읽고 새 프로젝트를 만들 수 있다', async () => {
  const db = env.authenticatedContext('pm', {}).firestore();
  await assertSucceeds(getDoc(doc(db, 'projects', 'p1')));
  await assertSucceeds(setDoc(doc(db, 'projects', 'p2'), { name: 'PM 프로젝트' }));
});

test('팀원은 본인 업무의 진행 상태만 수정할 수 있다', async () => {
  const db = env.authenticatedContext('member-ui', {}).firestore();
  await assertSucceeds(updateDoc(doc(db, 'tasks', 'task-ui'), { status: 'doing', progress: 50 }));
  await assertFails(updateDoc(doc(db, 'tasks', 'task-ui'), { projectId: 'p2' }));
});

test('다른 부서 팀원은 업무를 읽거나 수정할 수 없다', async () => {
  const db = env.authenticatedContext('member-dev', {}).firestore();
  await assertFails(getDoc(doc(db, 'tasks', 'task-ui')));
  await assertFails(updateDoc(doc(db, 'tasks', 'task-ui'), { status: 'done' }));
});

test('같은 부서 팀장은 업무를 읽고 관리할 수 있다', async () => {
  const db = env.authenticatedContext('lead-ui', {}).firestore();
  await assertSucceeds(getDoc(doc(db, 'tasks', 'task-ui')));
  await assertSucceeds(updateDoc(doc(db, 'tasks', 'task-ui'), { dueDate: '2026-09-02' }));
  await assertFails(deleteDoc(doc(db, 'tasks', 'task-ui')));
});

test('관리자는 업무를 삭제할 수 있다', async () => {
  const db = env.authenticatedContext('admin', {}).firestore();
  await assertSucceeds(deleteDoc(doc(db, 'tasks', 'task-ui')));
});
