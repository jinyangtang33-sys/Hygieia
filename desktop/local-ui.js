'use strict';
// Keep browser journals separate from hosted/development copies and from
// other local profiles, without deleting any pre-existing browser records.
const storagePrefix = 'hygieia-local-v1:' + window.HYGIEIA_LOCAL_PROFILE + ':';
const browserStorage = window.localStorage;
const storageKeys = () => Array.from({length:browserStorage.length}, (_,i)=>browserStorage.key(i)).filter(key=>key?.startsWith(storagePrefix));
window.HygieiaLocalStorage = {
  get length() { return storageKeys().length; },
  key(index) { return storageKeys()[index]?.slice(storagePrefix.length) ?? null; },
  getItem(key) { return browserStorage.getItem(storagePrefix + key); },
  setItem(key,value) { browserStorage.setItem(storagePrefix + key,value); },
  removeItem(key) { browserStorage.removeItem(storagePrefix + key); },
};
window.addEventListener('storage',event=>{
  if (event.key?.startsWith(storagePrefix)) window.dispatchEvent(new StorageEvent('storage', {key:event.key.slice(storagePrefix.length), oldValue:event.oldValue, newValue:event.newValue, url:event.url}));
});
document.addEventListener('DOMContentLoaded', () => {
  // This file is injected into the local build only. The hosted UI is intact.
  healthSyncCompact = () => '<div class="settings-section"><h3>健康记录</h3><p>可手动记录、导入体脂秤报告或恢复已有 JSON 备份。Apple 健康自动连接尚未适配本地版。</p><a class="text-btn" href="#health">打开健康记录</a></div>';
  syncPage = () => `<div class="page-head"><div><div class="eyebrow">LOCAL EDITION</div><h1>你的数据，保存在这台电脑。</h1><p>本地版无需云端账号，手动记录和体脂秤报告识别可以直接使用。</p></div></div><section class="panel"><h2>Apple 健康连接</h2><p>当前本地版尚未适配 PulsHealth 自动连接。云端版的连接配置不能在这里复用，也不会自动迁移你的健康数据。</p><p>你可以在健康模块手动录入，或导入体脂秤报告；已有观己备份可在偏好设置中导入。</p><a class="btn btn-primary" href="#health">去记录健康数据</a></section>`;
  const original = PersonalSync.panel;
  PersonalSync.panel = () => original().replace(/<a class="btn" href="\/signin-with-chatgpt[^>]*>重新登录<\/a>/, '').replace('三餐、待办、专注、自媒体、资产、手记、手动健康记录与偏好设置，会同步到同一账号的本机空间。断网时先在本机保存，重新联网后补传。', '三餐、任务和其他记录保存在这台电脑的 SQLite 数据库中。浏览器保留待保存副本，程序重新启动后继续写入；不会上传到作者的网站。');
  const style = document.createElement('style');
  style.textContent = '.local-edition-panel{margin-top:24px}.local-edition-panel code{overflow-wrap:anywhere}.local-stop{margin-left:8px}';
  document.head.append(style);
  let info, stopped = false;
  const markStopped = panel => {
    panel.querySelectorAll('[data-local]').forEach(button => { button.disabled = true; });
    panel.querySelector('#local-edition-message').textContent = '本地服务已退出，可以关闭浏览器。下次双击启动文件即可继续使用。';
  };
  function mount() {
    if (page !== 'settings' || document.querySelector('#local-edition-panel') || !info) return;
    const panel = document.createElement('section');
    panel.id = 'local-edition-panel'; panel.className = 'panel local-edition-panel';
    panel.innerHTML = '<h2>本地版 · ' + esc(info.version) + '</h2><p>数据目录：<code>' + esc(info.dataDir) + '</code></p><p>无需注册，不会自动跨设备同步。更新时替换程序文件，保留此数据目录即可。定时恢复点仅在本地程序运行时执行，仍需定期导出备份到其他位置。</p><button class="btn" data-local="folder">打开数据目录</button><button class="btn local-stop" data-local="stop">退出本地服务</button><p role="status" id="local-edition-message"></p>';
    if (stopped) markStopped(panel);
    document.querySelector('#main')?.append(panel);
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-local]'); if (!button) return;
    if (stopped) return;
    try {
      if (button.dataset.local === 'stop') {
        if (recordDraftDirty || journalDirty || reviewDirty) { toast('请先保存当前填写内容再退出。', true); return; }
        if (AssetLedger.pending() || HygieiaLocalStorage.getItem('selfspace-data-action-v1')) { toast('请先确认待处理的记账或数据恢复操作。', true); return; }
        await PersonalSync.sync();
        const state = PersonalSync.dataState();
        if (state.pending || state.running || state.conflicts || state.error || state.settingsDirty || state.blocked) { toast('请先保存偏好并处理待保存内容，再退出。', true); return; }
      }
      const response = await fetch('/_local/' + button.dataset.local, {method:'POST'});
      if (!response.ok) throw Error('操作未完成，请重试。');
      if (button.dataset.local === 'stop') {
        stopped = true;
        const panel = document.querySelector('#local-edition-panel');
        if (panel) markStopped(panel);
      }
    } catch (error) { toast(error.message, true); }
  });
  new MutationObserver(mount).observe(document.querySelector('#main'), {childList:true});
  fetch('/_local/info').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { info = data; mount(); }).catch(() => {});
  document.querySelector('.local-status')?.setAttribute('aria-label','查看本地保存状态');
  render();
});
