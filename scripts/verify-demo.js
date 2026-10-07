const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
assert.equal(config.hosting.public,'public');assert.equal(config.hosting.site,'fmv-schedule');assert.equal(config.firestore,undefined);
const html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
assert.ok(html.includes('data-storage-key="milestone-office-test-v1"'));assert.ok(!html.includes('firebasejs'));assert.ok(!html.includes('js/main.js'));
for(const [,file] of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(file==='/')continue;assert.ok(fs.existsSync(path.join(publicDir,file)),file+' missing');}
for(const file of ['js/state.js','js/render.js','js/template-engine.js','tests/browser/share-seed.js','tests/browser/memory-firestore.js'])new Function(fs.readFileSync(path.join(publicDir,file),'utf8'));
assert.equal(fs.existsSync(path.join(publicDir,'firestore.rules')),false);
function checkPublic(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,item.name);assert.ok(!/local-only|actual-data\.json|actual-seed\.js|pc15-task-table\.json|import-review\.json|actual-import-config\.json/i.test(full),'Private local data must not be published: '+full);if(item.isDirectory())checkPublic(full);}}
checkPublic(publicDir);
console.log('Test-only Hosting package verified. No production DB or credentials bundled.');
