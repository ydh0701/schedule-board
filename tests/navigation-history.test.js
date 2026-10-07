const {test}=require('node:test'),assert=require('node:assert/strict');
const {decode,encode,normalize,createRouter}=require('../public/js/ui/navigation-history');
test('first visit defaults to dashboard; invalid or disallowed routes fall back safely',()=>{assert.equal(decode('').view,'home');assert.equal(decode('#view=bad').view,'home');assert.equal(decode('#view=admin',view=>view!=='admin').view,'home');assert.equal(normalize({view:'team'}).view,'people');});
test('detail route supports escaped IDs, completed list and stage',()=>{const route={view:'projects',projectId:'한글 / ID',list:'completed',stage:'m2'};assert.deepEqual(decode(encode(route)),route);assert.equal(encode({view:'home',projectId:'unrelated'}),'#view=home');});
test('back and forward restore without appending entries; rerender does not duplicate entries',()=>{
  const location={pathname:'/tests/browser/share.html',search:'',hash:''},entries=[],listeners={};let current={},renderCount=0;
  const history={replaceState:(state,_,url)=>{location.hash=url.slice(url.indexOf('#'));entries.push(['replace',state]);},pushState:(state,_,url)=>{location.hash=url.slice(url.indexOf('#'));entries.push(['push',state]);}};
  const router=createRouter({location,history,capture:()=>current,restore:route=>current=route,render:()=>{renderCount++;router.sync();},listen:(type,fn)=>listeners[type]=fn});
  router.initialize();assert.equal(current.view,'home');router.sync();assert.equal(entries.length,1);
  current={view:'projects',projectId:null,list:'completed'};router.sync();router.sync();assert.equal(entries.filter(e=>e[0]==='push').length,1);
  location.hash='#view=home';listeners.popstate();assert.equal(current.view,'home');assert.equal(entries.filter(e=>e[0]==='push').length,1);
  location.hash='#view=projects&list=completed&project=p&stage=m2';listeners.popstate();assert.equal(current.projectId,'p');assert.equal(current.stage,'m2');assert.equal(renderCount,2);
});
