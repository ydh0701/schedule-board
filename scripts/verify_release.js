/* 배포 전 정적 파일 무결성 검사: node scripts/verify_release.js */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const required = ['index.html', 'js/state.js', 'js/render.js', 'js/main.js', 'css/style.css'];
const brokenMarkers = ['Warning: truncated output', 'Total output lines:', 'Script running with cell ID'];
let failed = false;

function fail(message) {
  failed = true;
  console.error(`✗ ${message}`);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`필수 파일이 없습니다: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

for (const relativePath of required) {
  const content = read(relativePath);
  if (!content) continue;
  const marker = brokenMarkers.find(value => content.includes(value));
  if (marker) fail(`${relativePath}에 손상 표식이 있습니다: ${marker}`);
  if (relativePath.endsWith('.js')) {
    try {
      execFileSync(process.execPath, ['--check', path.join(root, relativePath)], { stdio: 'pipe' });
    } catch (error) {
      fail(`${relativePath} 문법 검사 실패: ${error.stderr?.toString().trim() || error.message}`);
    }
  }
}

const html = read('index.html');
for (const asset of [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1])) {
  if (!fs.existsSync(path.join(root, asset))) fail(`index.html이 참조하지만 없는 자산: ${asset}`);
}

if (!failed) {
  console.log('✓ 배포 전 검사 통과');
  required.forEach(relativePath => {
    const content = fs.readFileSync(path.join(root, relativePath));
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
    console.log(`  ${relativePath}  ${content.length} bytes  ${hash}`);
  });
}

process.exit(failed ? 1 : 0);

