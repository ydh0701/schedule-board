/* Browser-only fixture. Never connects to Firebase or production accounts. */
(function(){
  const ephemeral = document.currentScript?.dataset.ephemeral === 'true'||new URLSearchParams(location.search).get('ephemeral')==='1';
  const storageKey = document.currentScript?.dataset.storageKey || 'milestone-local-browser-test';
  let saved=[];try{saved=ephemeral?[]:JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{}
  const store = new Map(Array.isArray(saved)?saved:[]);
  let counter = store.size * 100;
  const clone = value => structuredClone(value);
  const deletion = '__TEST_DELETE__';
  const timestamp = '__TEST_SERVER_TIMESTAMP__';
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
  function query(name,filters=[],sort=null,maximum=Infinity,cursor=null){
    const read=()=>{
      let docs=[...store.entries()].filter(([key,value])=>key.startsWith(name+'/')&&key.split('/').length===name.split('/').length+1&&filters.every(([field,op,target])=>op==='array-contains'?(value[field]||[]).includes(target):value[field]===target)).map(([key])=>snapshot(key,key.split('/').at(-1)));
      if(sort)docs=docs.filter(doc=>doc.data()[sort[0]]!==undefined).sort((a,b)=>{const left=a.data()[sort[0]],right=b.data()[sort[0]];return (String(left).localeCompare(String(right))||a.id.localeCompare(b.id))*(sort[1]==='desc'?-1:1);});
      if(cursor){const index=docs.findIndex(doc=>doc.id===cursor.id);if(index>=0)docs=docs.slice(index+1);}
      docs=docs.slice(0,maximum);return {docs,metadata:{fromCache:false},forEach:callback=>docs.forEach(callback)};
    };
    const result = { doc: id => reference(name,id || `test_${++counter}`),
      onSnapshot: callback => { callback({docs:[],forEach:()=>{}}); return ()=>{}; },
      where: (...filter)=>query(name,[...filters,filter],sort,maximum,cursor),orderBy:(...order)=>query(name,filters,order,maximum,cursor),limit:count=>query(name,filters,sort,count,cursor),startAfter:doc=>query(name,filters,sort,maximum,doc),get:async()=>read() };
    return result;
  }
  function write(type,ref,data,options,commitTime=new Date().toISOString()){
    const value = type==='update' || options?.merge ? {...store.get(ref.key),...clone(data)} : clone(data);
    Object.keys(value).forEach(key=>{if(value[key]===deletion) delete value[key];else if(value[key]===timestamp)value[key]=commitTime;else if(value[key]?.__TEST_ARRAY_UNION__)value[key]=[...new Set([...(store.get(ref.key)?.[key]||[]),...value[key].__TEST_ARRAY_UNION__])];});
    store.set(ref.key,value);
    persist();
  }
  function batch(){
    const pending=[];
    const api={set:(...args)=>pending.push(['set',...args]),update:(...args)=>pending.push(['update',...args]),delete:ref=>pending.push(['delete',ref]),
      commit:async()=>{const time=new Date().toISOString();pending.forEach(args=>{if(args[0]==='delete'){store.delete(args[1].key);persist();}else write(args[0],args[1],args[2],args[3],time);});window.refreshTestData?.();}};
    return api;
  }
  const database={collection:query,batch,runTransaction:async callback=>{
    const writer=batch(); await callback({...writer,get:ref=>ref.get()}); await writer.commit();
  }};
  const firestore=()=>database;
  firestore.FieldValue={serverTimestamp:()=>timestamp,delete:()=>deletion,arrayUnion:(...values)=>({__TEST_ARRAY_UNION__:values})};
  window.firebase={firestore,auth:Object.assign(()=>({}),{GoogleAuthProvider:function(){}})};
  window.testStore=store;
  function persist(){if(!ephemeral)try{localStorage.setItem(storageKey,JSON.stringify([...store]));}catch{}}
  window.persistTestStore=persist;
})();
