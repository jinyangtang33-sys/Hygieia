'use strict';
const LocalWelcome = (() => {
  const M = LocalOnboardingModel;
  let info = null, autoAttempted = false, draft = null, busy = false;
  const entries = [
    ['task','01','创建第一个任务','写下想完成的一件小事，安排截止时间。'],
    ['report','02','导入健康报告','选择体脂秤截图，核对识别结果后保存。'],
    ['restore','03','恢复已有备份','先预览范围，再决定是否恢复，不会直接覆盖。'],
  ];
  const ready = () => {
    const s = PersonalSync.dataState();
    return info && s.ready && s.owner === info.owner && !s.blocked && !s.error;
  };
  function canOpen() {
    if (modal.open || recordDraftDirty || journalDirty || reviewDirty || PersonalSync.dataState().settingsDirty) {
      toast('请先保存或关闭当前编辑，再打开使用帮助。',true); return false;
    }
    return true;
  }
  function error(message) {
    const target = document.getElementById('local-welcome-error');
    if (target) target.textContent = message;
    else toast(message,true);
  }
  const moduleLinks = focus => M.modules.filter(module=>focus?.includes(module.id)).map(module=>`<button class="local-module-link" type="button" data-welcome-module="${module.id}">${module.label} ${icon('arrow')}</button>`).join('');
  const entryButtons = () => entries.map(([action,number,title,description])=>`<button class="local-start-card" type="button" data-welcome-entry="${action}"><span class="local-step-number">${number}</span><strong>${title}</strong><span>${description}</span><span class="local-card-arrow" aria-hidden="true">↗</span></button>`).join('');
  function mount() {
    const actions = document.querySelector('.topbar-actions');
    if (actions && !document.getElementById('local-help-button')) {
      const button = document.createElement('button');
      button.id = 'local-help-button'; button.className = 'icon-button local-help-button';
      button.type = 'button'; button.dataset.welcome = 'help';
      button.setAttribute('aria-label','使用帮助与反馈'); button.title = '使用帮助与反馈'; button.textContent = '?';
      actions.prepend(button);
    }
    if (!info) return;
    if (page === 'overview' && !document.getElementById('local-start-panel')) {
      const panel = document.createElement('section');
      panel.id = 'local-start-panel'; panel.className = 'panel local-start-panel';
      const pending = info.onboarding.status === 'pending';
      panel.innerHTML = `<div class="panel-head"><div><span class="eyebrow">YOUR FIRST SMALL STEP</span><h2>${pending?'从一条记录开始':'继续你的记录'}</h2><p>${pending?'不必一次填满所有模块，先从最有用的一件事开始。':'保留自己的节奏，常用入口就在这里。'}</p></div><button type="button" class="text-btn" data-welcome="open">${pending?'开始使用引导':'调整使用偏好'}</button></div><div class="local-start-grid">${entryButtons()}</div>${info.onboarding.focus.length?`<nav class="local-module-links" aria-label="我的常用模块">${moduleLinks(info.onboarding.focus)}</nav>`:''}`;
      document.querySelector('#main')?.prepend(panel);
    }
    const settings = document.getElementById('local-edition-panel');
    if (settings && !settings.querySelector('[data-local-help-links]')) {
      const row = document.createElement('div'); row.dataset.localHelpLinks = '';
      row.className = 'settings-buttons local-help-links';
      row.innerHTML = '<button type="button" class="btn" data-welcome="open">重新查看使用引导</button><button type="button" class="btn" data-welcome="help">使用帮助与反馈</button>';
      settings.append(row);
    }
    if (!autoAttempted && info.onboarding.status === 'pending' && !info.hasRecords && ready() && !modal.open
      && !recordDraftDirty && !journalDirty && !reviewDirty && !PersonalSync.dataState().settingsDirty) {
      autoAttempted = true;
      open();
    }
  }
  function open() {
    if (!canOpen()) return;
    if (!ready()) { toast('正在连接本地数据库，请稍后再打开引导。',true); return; }
    autoAttempted = true;
    draft = {
      name:state.settings.name || '我的空间', originalName:state.settings.name,
      nameRevision:PersonalSync.recordState('settings/name').revision,
      focus:info.onboarding.focus.length ? [...info.onboarding.focus] : ['tasks','health'],
      revision:info.onboarding.revision, step:1, dirty:false,
    };
    show();
  }
  function show() {
    const preferences = draft.step === 1;
    modalShell(preferences?'欢迎来到观己':'先做一件小事',preferences?'1 / 2 · 认识你的空间':'2 / 2 · 选择你的第一步',
      `<div class="local-welcome"><div class="local-welcome-progress" aria-label="使用引导进度"><span class="active"></span><span class="${preferences?'':'active'}"></span></div>${preferences?
      `<div class="local-welcome-intro"><span class="local-welcome-mark" aria-hidden="true">观</span><div><h3>给生活留一个位置。</h3><p>不用注册，也不必从零配置。按自己的节奏记录就好。</p></div></div><div class="local-storage-note"><strong>你的数据，留在这台电脑。</strong><p>记录保存在本地数据库，不会自动上传到作者的网站，也不会自动跨设备同步。</p><details><summary>查看我的数据目录</summary><code>${esc(info.dataDir)}</code><p>可在偏好设置中导出备份。更新时保留此目录即可。</p></details></div>
      <form id="local-welcome-form"><div class="form-field"><label for="local-welcome-name">我希望被这样称呼</label><input id="local-welcome-name" name="name" maxlength="30" required autocomplete="nickname" value="${esc(draft.name)}"></div><fieldset class="local-focus-options"><legend>你想先记录什么？<small>可多选，其他模块也随时可用。</small></legend>${M.modules.map(module=>`<label><input type="checkbox" name="focus" value="${module.id}" ${draft.focus.includes(module.id)?'checked':''}><span>${module.label}</span></label>`).join('')}</fieldset><p class="backup-error" id="local-welcome-error" role="status"></p><div class="modal-footer"><button class="text-btn" type="button" data-welcome="skip">稍后设置</button><button class="btn btn-primary" type="submit">下一步 ${icon('arrow')}</button></div></form>`
      : `<h3>不必一次用完所有功能。</h3><p>选择一个入口，留下第一条真实记录；也可以先逛逛。</p><div class="local-start-grid local-start-grid-dialog">${entryButtons()}</div><p class="local-welcome-footnote">报告识别需要人工核对；Apple 健康自动连接尚未适配本地版。</p><p class="backup-error" id="local-welcome-error" role="status"></p><div class="modal-footer"><button class="btn" type="button" data-welcome="back">返回修改</button><button class="btn btn-primary" type="button" data-welcome="finish">先进入总览</button></div>`}</div>`);
    recordDraftDirty = draft.dirty;
  }
  async function syncReady() {
    await PersonalSync.sync();
    const until = Date.now()+8000;
    while (PersonalSync.dataState().running && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,80));
    const s = PersonalSync.dataState();
    if (!s.ready || s.blocked || s.error || s.running || s.pending || s.conflicts || s.settingsDirty) throw Error('请先完成本地保存并处理修改冲突，再继续引导。');
  }
  async function finish(action = 'overview', skip = false) {
    if (busy || !draft) return;
    busy = true;
    const controls = Array.from(document.querySelectorAll('#modal-content button,#modal-content input'),button=>[button,button.disabled]);
    const setBusy = disabled => controls.forEach(([button,previous])=>{ button.disabled=disabled || previous; });
    let progress;
    const endProgress = () => { if(progress){progress.close();progress.remove();progress=null;} };
    setBusy(true); error('');
    try {
      if (skip && info.onboarding.status === 'complete') {
        recordDraftDirty=false; draft=null; closeModal(); toast('已保留原来的使用偏好。'); return;
      }
      // The shared sync deliberately pauses while an editor is open. Confirmed
      // preferences are held in draft; a separate read-only progress dialog
      // keeps the UI blocked while allowing the normal guarded sync to run.
      recordDraftDirty=false; closeModal(true);
      progress=document.createElement('dialog'); progress.className='local-saving';
      progress.setAttribute('aria-label','正在保存使用偏好');
      progress.innerHTML='<p role="status">正在保存使用偏好…</p>';
      progress.addEventListener('cancel',event=>event.preventDefault());
      document.body.append(progress); progress.showModal();
      await syncReady();
      if (!skip && draft.name !== state.settings.name) {
        if (state.settings.name !== draft.originalName || PersonalSync.recordState('settings/name').revision !== draft.nameRevision) throw Error('称呼已在其他窗口更新，请关闭引导后重新打开核对。');
        if (!commit(next=>{next.settings.name=draft.name;},null,{baseRevisions:{'settings/name':draft.nameRevision}})) throw Error('称呼尚未保存，请重试。');
        await syncReady();
        draft.nameRevision=PersonalSync.recordState('settings/name').revision; draft.originalName=state.settings.name;
      }
      const body = M.normalize({version:1,status:skip?'skipped':'complete',focus:skip?[]:draft.focus,expectedRevision:draft.revision});
      const response = await fetch('/_local/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      const saved = await response.json();
      const alreadySaved=response.status===409 && saved.onboarding?.status===body.status && JSON.stringify(saved.onboarding?.focus)===JSON.stringify(body.focus);
      if (!response.ok && !alreadySaved) {
        if(response.status===409 && saved.onboarding) info.onboarding=saved.onboarding;
        throw Error(saved.error || '使用偏好尚未保存，请重试。');
      }
      info.onboarding=saved.onboarding;
      recordDraftDirty=false; draft=null; endProgress();
      if (skip) { render(); toast('可以随时从右上角「?」重新打开引导。'); }
      else start(action);
    } catch (failure) {
      endProgress();
      if(draft) show();
      error(failure.name==='TimeoutError'?'保存超时，请重试；已保存的记录会保留。':failure.message);
    }
    finally { endProgress(); busy=false; setBusy(false); }
  }
  function go(route) {
    navigate(route);
    DateNavigation.write(selectedDate,followToday,true,route);
  }
  function start(action) {
    if (action==='task') { go('tasks'); Checklist.open(); }
    else if (action==='report') { go('health'); BodyReports.open(); }
    else if (action==='restore') {
      go('settings');
      modalShell('恢复已有观己备份','先预览，再确认',`<p>选择之前导出的观己 JSON 备份。读取文件后会先显示恢复范围，你确认后才写入数据库。</p><p class="field-help">这不是体脂秤截图入口；截图请使用「导入健康报告」。</p><div class="modal-footer"><button class="btn" type="button" data-action="close">取消</button><button class="btn btn-primary" type="button" data-action="import">选择备份文件</button></div>`);
    } else { go('overview'); }
  }
  function help() {
    if (!canOpen()) return;
    const version=info?.version || '', platform=info?.platform || '';
    modalShell('使用帮助与反馈','从一条记录开始，慢慢找到自己的方式',`<div class="local-help"><section><h3>从哪里开始？</h3><p>任务用来安排要做的事；健康支持手动记录和体脂秤报告。已有备份可以先预览后恢复。</p><div class="local-help-actions">${entries.map(([entry,,title])=>`<button class="btn" type="button" data-welcome-quick="${entry}">${title}</button>`).join('')}</div></section><section><h3>记录在哪里？</h3><p>数据保存在这台电脑；更新程序不会搬动数据目录。定期在偏好设置中下载完整备份，再存放到另一个位置。</p><p>关闭网页仍可保留记录；退出本地服务后，下次双击启动即可继续。手机与其他电脑不会自动同步。</p></section><section><h3>遇到问题，或有新的想法？</h3><p>反馈页面只预填软件版本和系统类型。不会附带日志、健康记录、备份或私人目录；请在 GitHub 核对、补充后自行提交。</p><div class="local-help-actions"><a class="btn" href="${esc(M.feedbackURL('bug',version,platform))}" target="_blank" rel="noopener noreferrer">到 GitHub 反馈问题 ↗</a><a class="btn" href="${esc(M.feedbackURL('feature',version,platform))}" target="_blank" rel="noopener noreferrer">到 GitHub 提出建议 ↗</a></div></section><div class="modal-footer"><button class="text-btn" type="button" data-welcome="reopen">重新查看使用引导</button><button class="btn btn-primary" type="button" data-action="close">知道了</button></div></div>`);
  }
  document.addEventListener('submit',event=>{
    if (event.target.id!=='local-welcome-form') return;
    event.preventDefault();
    try {
      const form=new FormData(event.target);
      const name=M.nickname(form.get('name'));
      const value=M.normalize({version:1,status:'complete',focus:form.getAll('focus'),expectedRevision:draft.revision});
      draft={...draft,name,focus:value.focus,step:2}; show();
    } catch (failure) { error(failure.message); }
  });
  document.addEventListener('input',event=>{
    if (event.target.closest?.('#local-welcome-form') && draft) { draft.dirty=true; recordDraftDirty=true; }
  });
  document.addEventListener('change',event=>{
    if (event.target.closest?.('#local-welcome-form') && draft) { draft.dirty=true; recordDraftDirty=true; }
  });
  document.addEventListener('click',event=>{
    const welcome=event.target.closest?.('[data-welcome]');
    if (welcome) {
      const action=welcome.dataset.welcome;
      if (busy) return;
      if (action==='open') open();
      if (action==='help') help();
      if (action==='reopen') { closeModal(true); open(); }
      if (action==='back' && draft) { draft.step=1; show(); }
      if (action==='skip') void finish('overview',true);
      if (action==='finish') void finish();
    }
    const entry=event.target.closest?.('[data-welcome-entry]');
    if (entry) {
      if (draft && modal.open) void finish(entry.dataset.welcomeEntry);
      else if (canOpen()) start(entry.dataset.welcomeEntry);
    }
    const quick=event.target.closest?.('[data-welcome-quick]');
    if (quick) { closeModal(true); start(quick.dataset.welcomeQuick); }
    const link=event.target.closest?.('[data-welcome-module]');
    if (link && canOpen()) { const module=M.modules.find(module=>module.id===link.dataset.welcomeModule); if(module)go(module.route); }
  });
  document.addEventListener('DOMContentLoaded',()=>{
    modal.addEventListener('cancel',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
    new MutationObserver(mount).observe(document.querySelector('#main'),{childList:true});
    new MutationObserver(mount).observe(document.querySelector('.local-status'),{childList:true,subtree:true});
    fetch('/_local/info').then(async response=>{
      if (!response.ok) throw Error();
      info=await response.json(); mount();
    }).catch(()=>{});
    mount();
  });
  return {open,help};
})();
