const fs=require('node:fs'),vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
class Storage{
  constructor(){this.values=new Map();this.fail=false;}
  get length(){return this.values.size;}
  key(i){return [...this.values.keys()][i]??null;}
  getItem(k){return this.values.get(k)??null;}
  setItem(k,v){if(this.fail)throw new Error('synthetic quota exceeded');this.values.set(k,String(v));}
  removeItem(k){this.values.delete(k);}
}
function client({base,owner,storage=new Storage(),initial=null,transport=fetch,url=null,dateNavigation=false,clock=Date,locks=null}){
  if(initial)storage.setItem('selfspace-v1',JSON.stringify(initial));
  const elements=new Map(),listeners={},windowListeners={},timers=new Map();let timerId=0;
  const element=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',value:'',open:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},removeAttribute(){},close(){this.open=false;},showModal(){this.open=true;}});return elements.get(k);};
  const loc=url?new URL(url):{hash:''},historyEntries=url?[loc.href]:[],historyPosition={value:0};let copied='';
  const history={replaceState(_a,_b,value){loc.href=new URL(value,loc.href).href;historyEntries[historyPosition.value]=loc.href;},pushState(_a,_b,value){loc.href=new URL(value,loc.href).href;historyEntries.splice(++historyPosition.value);historyEntries.push(loc.href);}};
  const context=vm.createContext({console,structuredClone,crypto:{randomUUID,subtle:webcrypto.subtle},TextEncoder,Date:clock,Intl,AbortController,URL,URLSearchParams,Blob,
    localStorage:storage,navigator:{onLine:true,...(locks?{locks}:{}),clipboard:{async writeText(value){copied=value;}}},location:loc,
    document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>({click(){}}),visibilityState:'visible',addEventListener:(k,f)=>(listeners[k]||=[]).push(f)},
    window:{history,scrollTo(){},addEventListener:(k,f)=>(windowListeners[k]||=[]).push(f)},
    setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},
    fetch:(path,options={})=>{const headers=new Headers(options.headers);headers.set('oai-authenticated-user-id',owner);if(options.method)headers.set('Origin',base);return transport(base+path,{...options,headers});},
  });
  const source=['public/fitness-model.js','public/fitness.js','public/body-layout.js','public/body-model.js','public/body-reports.js','public/body-trends-model.js','public/body-trends.js','public/media-accounts.js','public/media-topic-model.js','public/media-topics.js','public/media-history-model.js','public/media-history.js','public/self-media.js','public/health-sync.js','public/personal-sync.js',...(dateNavigation?['public/date-navigation.js']:[]),'public/search-model.js','public/search-center.js','public/focus-model.js','public/focus-timer.js','public/task-model.js','public/task-center.js','public/checklist-model.js','public/checklist.js','public/app.js'].map(f=>fs.readFileSync(__dirname+'/'+f,'utf8')).join('\n');vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  return {context,storage,elements,timers,run,copied:()=>copied,back:()=>{if(historyPosition.value>0){loc.href=historyEntries[--historyPosition.value];windowListeners.popstate?.forEach(f=>f({}));}},forward:()=>{if(historyPosition.value<historyEntries.length-1){loc.href=historyEntries[++historyPosition.value];windowListeners.popstate?.forEach(f=>f({}));}},visit:value=>{loc.href=new URL(value,loc.href).href;windowListeners.hashchange?.forEach(f=>f({}));},state:()=>JSON.parse(run('JSON.stringify(state)')),sync:()=>run('PersonalSync.sync()'),commit:code=>run('commit('+code+')'),status:()=>run('PersonalSync.status()'),pending:()=>JSON.parse(run('JSON.stringify(PersonalSync.pending())')),event:(type,event)=>windowListeners[type]?.forEach(f=>f(event)),edit:()=>{element('#modal').open=true;},close:()=>{element('#modal').open=false;}};
}
module.exports={Storage,client};
