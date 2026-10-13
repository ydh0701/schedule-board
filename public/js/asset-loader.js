/* Spreadsheet parsing is only needed after an import is requested. */
let spreadsheetLibraryPromise=null;
function loadSpreadsheetLibrary(){
  if(window.XLSX?.read)return Promise.resolve(window.XLSX);
  if(spreadsheetLibraryPromise)return spreadsheetLibraryPromise;
  spreadsheetLibraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let timer,settled=false;
    const finish=error=>{
      if(settled)return;settled=true;window.clearTimeout(timer);script.onload=null;script.onerror=null;
      if(error){script.remove();spreadsheetLibraryPromise=null;reject(error);}else resolve(window.XLSX);
    };
    script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.async=true;
    script.onload=()=>finish(window.XLSX?.read?null:new Error('엑셀 읽기 기능을 준비하지 못했습니다. 다시 시도해주세요.'));
    script.onerror=()=>finish(new Error('엑셀 읽기 기능을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'));
    timer=window.setTimeout(()=>finish(new Error('엑셀 읽기 기능의 응답이 지연되고 있습니다. 다시 시도해주세요.')),20000);
    document.head.appendChild(script);
  });
  return spreadsheetLibraryPromise;
}
