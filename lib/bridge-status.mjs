// Only operational metadata belongs in a heartbeat. No samples or credentials.
export function parseBridgeStatus(body,now=Date.now()){
  const fail=()=>{throw new Error('中转状态格式无效，请更新 Mac 中转程序。');};
  if(!body||body.version!==2||!Number.isSafeInteger(body.pendingDays)||body.pendingDays<0||body.pendingDays>100000)fail();
  const result={version:2,pendingDays:body.pendingDays};
  for(const key of ['lastReceived','lastForwarded','lastAttempt']){
    const v=body[key];if(v!==null&&(typeof v!=='string'||v.length>40||!Number.isFinite(Date.parse(v))||Date.parse(v)<946684800000||Date.parse(v)>now+300000))fail();
    result[key]=v===null?null:new Date(v).toISOString();
  }
  if(![null,'upload_failed'].includes(body.errorCode))fail();
  result.errorCode=body.errorCode;return result;
}
