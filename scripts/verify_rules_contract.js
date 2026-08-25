/* Firestore 권한 규칙의 핵심 계약이 완화되지 않았는지 검사합니다. */
const fs = require('fs');
const path = require('path');

const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
const contracts = [
  ['인증 확인', 'function signedIn() { return request.auth != null; }'],
  ['승인 사용자 제한', 'function approved() { return signedIn() && self().data.active == true; }'],
  ['관리자/PM 분리', 'function manager() { return admin() || pm(); }'],
  ['사용자 생성·삭제 관리자 전용', 'allow create, delete: if admin();'],
  ['프로젝트 생성·삭제 관리자 또는 PM 전용', 'allow create, delete: if manager();'],
  ['마일스톤 변경 관리자 또는 PM 전용', 'allow create, update, delete: if manager();'],
  ['업무 삭제 관리자 또는 PM 전용', 'allow delete: if manager();'],
  ['팀원 업무 수정 필드 제한', 'function memberEditableTaskFields()'],
  ['팀원 이관 필드 제한', 'function memberCanHandover()'],
  ['변경 이력 수정·삭제 금지', 'allow update, delete: if false;'],
  ['활동 이력 클라이언트 쓰기 금지', 'allow write: if false;']
];

let failed = false;
contracts.forEach(([name, expected]) => {
  if (rules.includes(expected)) console.log(`✓ ${name}`);
  else { failed = true; console.error(`✗ ${name}: 규칙 계약을 찾지 못했습니다.`); }
});

if (/allow\s+(?:read|write|create|update|delete)[^;]*:\s*if\s+true\s*;/m.test(rules)) {
  failed = true;
  console.error('✗ 무조건 허용되는 Firestore 규칙이 있습니다.');
} else {
  console.log('✓ 무조건 허용 규칙 없음');
}

process.exit(failed ? 1 : 0);

