/* Browser-only fixture. Never connects to Firebase or production accounts. */
(function(){
  const ephemeral = document.currentScript?.dataset.ephemeral === 'true';
  const storageKey = document.currentScript?.dataset.storageKey || 'milestone-local-browser-test';
  let saved=[];try{saved=ephemeral?[]:JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{}
  const store = new Map(Array.isArray(saved)?saved:[]);
  let counter = store.size * 100;
  const clone = value => structuredClone(value);
  const deletion = '__TEST_DELETE__';
  function reference(collection, id){
    const key = `${collection}/${id}`;
    return { id, collectionName: collection, key,
      collection: child => query(`${key}/${child}`),
      get: async () => snapshot(key, id),
      set: async (value, options) => { write('set', {key}, value, options); window.refreshTestData?.(); },
      update: async value => { write('update', {key}, value); window.refreshTestData?.(); }
    };
  }
  function snapshot(key,id){ return {id,exists:store.has(key),data:()=>clone(store.get(key))}; }
  function query(name){
    const result = { doc: id => reference(name,id || `test_${++counter}`),
      onSnapshot: callback => { callback({docs:[],forEach:()=>{}}); return ()=>{}; },
      where: ()=>result, orderBy: ()=>result, limit: ()=>result };
    return result;
  }
  function write(type,ref,data,options){
    const value = type==='update' || options?.merge ? {...store.get(ref.key),...clone(data)} : clone(data);
    Object.keys(value).forEach(key=>{if(value[key]===deletion) delete value[key];});
    store.set(ref.key,value);
    persist();
  }
  function batch(){
    const pending=[];
    const api={set:(...args)=>pending.push(['set',...args]),update:(...args)=>pending.push(['update',...args]),
      commit:async()=>{pending.forEach(args=>write(...args));window.refreshTestData?.();}};
    return api;
  }
  const database={collection:query,batch,runTransaction:async callback=>{
    const writer=batch(); await callback({...writer,get:ref=>ref.get()}); await writer.commit();
  }};
  const firestore=()=>database;
  firestore.FieldValue={serverTimestamp:()=>new Date().toISOString(),delete:()=>deletion};
  window.firebase={firestore,auth:Object.assign(()=>({}),{GoogleAuthProvider:function(){}})};
  window.testStore=store;
  function persist(){if(!ephemeral)try{localStorage.setItem(storageKey,JSON.stringify([...store]));}catch{}}
  window.persistTestStore=persist;
})();
