function createMediaHistoryModel(){
  const keyOK=key=>typeof key==='string'&&/^(media|media-topic)\/[a-zA-Z0-9_.:-]{1,100}$/.test(key);
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v??null);
  const fields={media:[['title','标题'],['platform','平台'],['accountId','关联账号'],['topicId','关联选题'],['format','内容形式'],['status','创作状态'],['plannedDate','计划发布日期'],['publishedDate','实际发布日期'],['url','作品链接'],['script','正文 / 脚本'],['notes','创作备注'],['views','浏览 / 播放量'],['likes','点赞'],['comments','评论'],['saves','收藏']], 'media-topic':[['title','选题名称'],['eventDate','事件日期'],['sources','信息来源'],['facts','已确认事实'],['viewpoint','个人观点'],['questions','待核实 / 后续追踪']]};
  function changes(key,current,previous){if(!keyOK(key))return [];return fields[key.split('/')[0]].filter(([k])=>canonical(current?.[k])!==canonical(previous?.[k])).map(([k,label])=>({key:k,label,current:current?.[k]??null,previous:previous?.[k]??null}));}
  function restored(key,previous,now){if(!keyOK(key)||!previous||previous.id!==key.split('/')[1])throw Error('历史版本无效。');return {...structuredClone(previous),updatedAt:now};}
  function display(key,value){if(value===null||value===undefined||value==='')return '未记录';if(key==='sources')return value.length?value.map((s,i)=>`${i+1}. ${s.title||'未填写来源名称'}\n${s.url}\n报道日期：${s.publishedDate||'未记录'}`).join('\n\n'):'未记录';return String(value);}
  return {keyOK,canonical,changes,restored,display};
}
const MediaHistoryModel=createMediaHistoryModel();
