'use strict';

const syncMetricLabels={steps:'步数',sleep:'睡眠',exercise:'运动时长',activeEnergy:'活动能量',restingHeartRate:'静息心率',heartRate:'平均心率',hrv:'心率变异性',respiratoryRate:'呼吸频率',weight:'体重',water:'饮水',fitness:'运动与圆环'};
let pairingBusy=false;
function syncTime(value){if(!value)return '尚未收到数据';const d=new Date(value);if(Number.isNaN(d.getTime()))return '时间未知';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);}
function healthSyncState(now=Date.now()){
  const c=cloudConnection,b=c?.bridge;
  if(cloudError)return {tone:'warn',label:'状态读取失败',hint:cloudError};
  if(cloudLoading&&!c)return {tone:'quiet',label:'正在检查',hint:'正在读取云端同步状态。'};
  if(!c?.enabled)return {tone:'quiet',label:c?'接收已暂停':'尚未连接',hint:c?'已有数据仍可查看，重新生成配置并更新 Mac 后恢复。':'先生成网站配置，再连接 Mac 和手机。'};
  if(!b||!c.bridgeSeenAt)return {tone:'warn',label:'等待中转报告',hint:'尚未收到新版 Mac 状态。请在 Mac 重新启动健康中转；已有健康数据仍可查看。'};
  const elapsed=now-Date.parse(c.bridgeSeenAt),online=Number.isFinite(elapsed)&&elapsed>=-300000&&elapsed<=180000;
  if(!online)return {tone:'warn',label:'Mac 状态未确认',hint:'超过 3 分钟没有收到中转报告。Mac 可能休眠、停止运行或网络中断；最后报告不代表当前状态。'};
  if(b.errorCode)return {tone:'warn',label:'上传正在重试',hint:'Mac 已保存数据，但最近一次上传未完成。请检查 Mac 管理页的错误说明；恢复连接后会自动重试。'};
  if(b.pendingDays>0)return {tone:'warn',label:'正在补传',hint:`Mac 还有 ${b.pendingDays} 天的汇总待上传。这里按日期计数，不是手机原始记录条数。`};
  if(!b.lastReceived)return {tone:'quiet',label:'等待手机数据',hint:'Mac 已连接网站。请在 PulsHealth 检查权限，并手动启动首次同步。'};
  return {tone:'good',label:'已收到的汇总已上传',hint:'Mac 最近报告没有待上传的每日汇总。手机是否还有待同步记录，请在 PulsHealth 查看。'};
}
function syncSummary(){
  const status=healthSyncState(),current=day().apple;
  return `<div class="sync-summary sync-tone-${status.tone}"><span>${icon('heart')}<span><strong>健康同步 · ${esc(status.label)}</strong><br>${current?`这一天的数据更新于 ${syncTime(current.updatedAt)}`:'这一天还没有 Apple 健康数据'}</span></span><a class="text-btn" href="#sync">查看同步 ${icon('arrow')}</a></div>`;
}
function healthSyncCompact(){const status=healthSyncState();return `<div class="settings-section"><h3>Apple 健康同步</h3><p><strong>${esc(status.label)}</strong> · 网站最后接收：${syncTime(cloudConnection?.lastSync)}</p><p>${esc(status.hint)}</p><a class="text-btn" href="#sync">查看完整同步状态 ${icon('arrow')}</a></div>`;}
function syncMonitor(){
  const c=cloudConnection,b=c?.bridge,status=healthSyncState();
  const phone=b?.lastReceived?syncTime(b.lastReceived):'尚无接收报告';
  return `<section class="panel sync-monitor spaced-bottom" aria-label="健康同步状态"><div class="panel-head"><h2>${icon('heart')}健康数据的旅程</h2><span class="sync-badge sync-tone-${status.tone}" role="status">${esc(status.label)}</span></div><p class="sync-status-hint">${esc(status.hint)}</p><ol class="sync-pipeline"><li><span class="mini-label">01 · iPhone → Mac</span><h3>手机数据最后接收</h3><strong>${phone}</strong><p>Mac 最后收到 PulsHealth 数据的时间。网站无法直接检查手机队列。</p></li><li><span class="mini-label">02 · Mac → 云端</span><h3>每日汇总最后保存</h3><strong>${syncTime(c?.lastSync)}</strong><p>${b?`上次报告：${b.pendingDays} 天待上传`:'待上传天数：等待中转报告'}${b?.lastAttempt?`<br>最近尝试 ${syncTime(b.lastAttempt)}`:''}</p></li><li><span class="mini-label">03 · Mac 状态报告</span><h3>${c?.bridgeSeenAt?'最近一次联系':'等待中转联系'}</h3><strong>${c?.bridgeSeenAt?syncTime(c.bridgeSeenAt):'尚无报告'}</strong><p>运行时约每 30 秒上报；超过 3 分钟未联系，显示为状态未确认。</p></li></ol>${b?.lastReceived&&Date.now()-Date.parse(b.lastReceived)>86400000?'<div class="sync-notice error">超过 24 小时没有新的手机接收报告。这不代表健康数据丢失；需要更新时，让手机和 Mac 连接同一 Wi-Fi，并在 PulsHealth 手动同步。</div>':''}<div class="sync-monitor-actions"><button class="btn" data-sync-action="refresh" ${cloudLoading?'disabled':''}>${cloudLoading?'正在检查…':'刷新状态'}</button><a class="text-btn" href="http://127.0.0.1:8765" target="_blank" rel="noopener noreferrer">在 Mac 打开中转管理页 ${icon('arrow')}</a><span class="field-help">管理页仅在运行中转的 Mac 上可用，手机和其他电脑请查看这里的云端报告。</span></div></section>`;
}
function syncCoverage(){
  const dates=Object.keys(cloudHealth).sort().reverse(),latest=dates[0];
  return `<section class="panel spaced-bottom"><div class="panel-head"><h2>哪些数据已经到达？</h2><span class="mini-label">仅统计 Apple 健康云端记录</span></div><p class="sync-status-hint">${latest?`最新数据日期：${esc(latest)} · 已收录 ${dates.length} 天`:'尚未收到每日健康汇总'}。上传时间与数据日期不同，回填旧记录也会更新上传时间。</p><div class="table-scroll"><table class="detail-list sync-coverage"><thead><tr><th>指标</th><th>最近数据日期</th><th>近 7 天有记录</th></tr></thead><tbody>${Object.entries(syncMetricLabels).map(([key,label])=>{const found=dates.filter(d=>(key==='fitness'?cloudHealth[d]?.fitness:cloudHealth[d]?.health?.[key])!==undefined);const count=found.filter(d=>d>=shiftDate(TODAY,-6)&&d<=TODAY).length;return `<tr><td>${label}</td><td>${found[0]?esc(found[0]):'尚未收到'}</td><td>${count} / 7 天</td></tr>`;}).join('')}</tbody></table></div><p class="health-note">未收到可能是未授权、未选择该指标、当天没有记录或尚未同步；缺失数据不会当作 0。体重和饮水可按需选择。</p></section>`;
}
function appleMetricsPanel(){
  if(!day().apple)return '';
  const h=health();
  const metrics=[['静息心率','restingHeartRate','次/分','heart'],['平均心率','heartRate','次/分','heart'],['心率变异性','hrv','ms','heart'],['活动能量','activeEnergy','kcal','walk'],['呼吸频率','respiratoryRate','次/分','heart']].filter(([,key])=>h[key]!==undefined);
  const sleep=[['核心睡眠','coreSleep'],['深度睡眠','deepSleep'],['快速动眼睡眠','remSleep']].filter(([,key])=>h[key]!==undefined);
  return `${metrics.length?`<div class="apple-metric-grid">${metrics.map(([label,key,unit,ic])=>metric(label,num(h[key]),unit,'Apple 健康 · 每日汇总',ic)).join('')}</div>`:''}${sleep.length?`<section class="panel spaced-bottom"><div class="panel-head"><h2>${icon('moon')}昨夜的睡眠阶段</h2><span class="mini-label">按醒来日期归档 · 时长由 Apple 健康提供</span></div><div class="sleep-stage-grid">${sleep.map(([label,key])=>`<div class="sleep-stage"><span>${label}</span><strong>${Math.floor(h[key])}<small>小时</small> ${Math.round((h[key]%1)*60)}<small>分钟</small></strong></div>`).join('')}</div></section>`:''}`;
}
function syncPage(){
  const c=cloudConnection;
  return `<div class="page-head"><div><div class="eyebrow">APPLE HEALTH · VIA YOUR MAC</div><h1>让记录，自动发生。</h1><p>PulsHealth 读取 Apple 健康，Mac 把每日健康记录带回观己。</p></div><button class="btn" data-sync-action="refresh" ${cloudLoading?'disabled':''}>${icon('chart')}刷新同步状态</button></div>
  <section class="welcome sync-welcome"><div class="hero-copy"><span class="tag">${icon('lock')}你的 Mac，你的健康中转</span><h2 style="margin-top:13px">佩戴手表，好好生活。记录随后而来。</h2><p>Apple Watch → iPhone 健康 → PulsHealth → Mac → 观己。<br>中转先在本机保存，网络恢复后自动补传。</p></div>${art()}</section>
  ${syncMonitor()}${syncCoverage()}
  ${cloudError?`<div class="sync-notice error">${esc(cloudError)} <a href="/signin-with-chatgpt?return_to=%2F%23sync" target="_top">重新登录</a></div>`:''}
  ${c?.lastError?`<div class="sync-notice error"><strong>最近一次上传未成功：</strong>${esc(c.lastError)}</div>`:''}

  <div class="section-grid"><section class="panel full"><div class="panel-head"><h2>连接你的 Mac 和 iPhone</h2><span class="tag">PulsHealth + 本机中转</span></div><div class="sync-steps"><div><span class="step-number">01</span><h3>先生成网站配置</h3><p>直接点击下方「生成连接配置」，再点击「复制 Mac 配置」。这一步无需先连接 Mac 或手机。</p></div><div><span class="step-number">02</span><h3>连接 Mac 中转</h3><p>双击本地的「启动健康中转.command」，在管理页粘贴配置并保存，保持中转运行。</p><a class="text-btn" href="http://127.0.0.1:8765" target="_blank" rel="noopener noreferrer">在 Mac 打开中转管理页 ${icon('arrow')}</a></div><div><span class="step-number">03</span><h3>手机扫码配对</h3><p>iPhone 与 Mac 连接同一 Wi-Fi。在 PulsHealth 的 Sync → Database 中扫描中转页二维码，测试连接、保存，再选择数据。</p></div></div>
  <div class="pair-actions"><button class="btn btn-primary" data-sync-action="pair" ${pairingBusy?'disabled':''} aria-busy="${pairingBusy}" aria-describedby="pairing-help">${icon('plus')}${pairingBusy?'正在生成…':c?.enabled?'重新生成连接配置':'生成连接配置'}</button>${c?.enabled?`<button class="btn" data-sync-action="disconnect">暂停网站接收</button>`:''}<span class="field-help" id="pairing-help">首次连接：先生成配置，再连接 Mac，最后配对手机。重新生成会立即使旧密钥失效，需要在 Mac 中更新。</span></div>
  ${syncSetup?connectionFields():''}</section>
  <section class="panel"><div class="panel-head"><h2>手机从这些数据开始</h2><a class="text-btn" href="https://github.com/PulsHealth/pulshealth" target="_blank" rel="noopener noreferrer">PulsHealth 官方说明 ${icon('arrow')}</a></div><table class="detail-list sync-options"><tbody>${[['Sleep Analysis / 睡眠','Raw Samples / 原始记录'],['Steps / 步数','Daily total / 每日总量'],['Active Energy / 活动能量','Daily total / 每日总量'],['Exercise Time / 运动时长','Daily total / 每日总量'],['Heart Rate / 心率','Daily average / 每日平均'],['Resting Heart Rate / 静息心率','Daily average / 每日平均'],['HRV / 心率变异性','Daily average / 每日平均'],['Respiratory Rate / 呼吸频率','Daily average / 每日平均']].map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table><p class="health-note">数量指标在 Aggregates 中添加，间隔选择 1 day、来源选择 All devices，手机使用北京时间。首次先同步最近 7 天，并保持 iPhone 解锁。体重可选 Most recent，饮水可选 Daily total。</p></section>
  <section class="panel"><div class="panel-head"><h2>同步什么时候发生？</h2><span class="mini-label">自动，但不保证实时</span></div><div class="sync-explainer" style="border-top:0;padding-top:0"><h3>手机出现新数据之后</h3><p>PulsHealth 在获得健康数据读取权限后，通过 iOS 后台机制同步新增记录。iOS 决定实际执行时机，锁屏和省电设置也可能推迟同步。</p><h3>Mac 唤醒、同一 Wi-Fi 时接收</h3><p>离开 Wi-Fi 或 Mac 休眠时，手机端待同步数据会在后续可用时补传。需要尽快更新时，回到同一网络并打开 PulsHealth 手动启动同步。</p><h3>已接收的数据会先在 Mac 保存</h3><p>网站暂时连不上时，中转会保留本机数据并重试。睡眠按醒来的日期归档，排除卧床与清醒时间；步数使用每日汇总，避免直接叠加手机和手表的原始样本。</p></div></section>
  <section class="daily-note full"><h3>${icon('lock')}你掌握每一段连接</h3><p>PulsHealth 的免费自托管方式不需要购买同步订阅；Mac 需要开机、唤醒并运行中转。云端沿用此站点现有托管，相关托管额度或费用以平台为准。<br>原始记录保存在 Mac，本页面支持的每日指标同步到私人网站。三餐、工作、资产等个人记录也会同步到私人云端，本机保留离线缓存。局域网接收使用 HTTP，请仅在可信 Wi-Fi 使用。<br>网站连接配置只在生成后显示，离开此页会清除显示；手机配对码只在 Mac 本机管理页提供。</p></section></div>`;
}
function connectionFields(){return `<div class="connection-fields"><h3>${icon('check')}Mac 连接配置已生成</h3><p class="field-help">请把完整配置粘贴到 Mac 中转管理页。包含访问凭据，请仅在自己的 Mac 使用，离开此页后不再显示。</p><button class="btn btn-primary" data-sync-action="copy" data-copy="mac">复制 Mac 配置</button><p class="field-help">接下来打开 Mac 管理页，保存连接后，再用 PulsHealth 扫描管理页的手机配对二维码。</p></div>`;}
async function cloudRequest(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(path,{...options,signal:controller.signal,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...options.headers}});
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.includes('application/json'))throw new Error('请在手机或电脑浏览器中登录此私人站点，再设置同步。');
    const data=await response.json();if(!response.ok)throw new Error(data.error||'同步服务暂时不可用。');return data;
  }catch(error){if(error.name==='AbortError')throw new Error('网站响应超时，请重试；生成配置无需先连接 Mac 或手机。');throw error;}
  finally{clearTimeout(timeout);}
}
async function loadCloudHealth(force=false){
  if(cloudLoading)return;cloudLoading=true;
  try{const data=await cloudRequest('/api/health');cloudHealth=data.days||{};cloudConnection=data.connection;cloudError=null;}
  catch(error){cloudError=error.message;}
  finally{cloudLoading=false;if(force||['overview','health','trends','sync','settings','review','calendar','quality'].includes(page)&&!modal.open&&!(typeof PersonalSync!=='undefined'&&PersonalSync.isEditing()))render();}
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-sync-action]');if(!button)return;
  const action=button.dataset.syncAction;
  if(action==='refresh'){await loadCloudHealth(true);if(!cloudError)toast('同步状态已更新。');}
  if(action==='copy'){
    try{await navigator.clipboard.writeText(JSON.stringify({bridgeUrl:syncSetup.bridgeUrl,headers:syncSetup.headers}));toast('已复制，请粘贴到 Mac 中转管理页。');}
    catch{toast('复制未完成，请允许浏览器剪贴板权限后重试。',true);}
  }
  if(action==='pair'){
    if(pairingBusy)return;
    const pair=async()=>{pairingBusy=true;syncSetup=null;render();try{syncSetup=await cloudRequest('/api/health/connection',{method:'POST'});toast('连接配置已生成，请复制到 Mac 中转。');void loadCloudHealth(true);}catch(error){toast(error.message,true);}finally{pairingBusy=false;render();}};
    if(cloudConnection?.enabled)confirmAction('重新生成连接配置','原来的同步密钥会立即失效，需要在 Mac 中转里更新配置。已同步的数据会保留。',pair,'重新生成');else await pair();
  }
  if(action==='disconnect')confirmAction('暂停接收新的健康数据','Mac 将无法继续向网站上传，已有健康数据会保留。Mac 本机接收不受此开关控制。需要恢复时，可以重新生成连接配置。',async()=>{try{await cloudRequest('/api/health/connection',{method:'DELETE'});syncSetup=null;await loadCloudHealth(true);toast('已暂停接收，已有数据仍然保留。');}catch(error){toast(error.message,true);}},'暂停接收');
});
document.addEventListener('DOMContentLoaded',()=>{loadCloudHealth();setInterval(()=>{if(document.visibilityState==='visible')loadCloudHealth();},30000);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadCloudHealth();});
