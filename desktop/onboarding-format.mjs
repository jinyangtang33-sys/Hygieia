export const onboardingModel = (() => {
  const modules = [
    {id:'tasks', label:'任务与工作', route:'tasks'},
    {id:'health', label:'健康记录', route:'health'},
    {id:'life', label:'三餐与生活', route:'meals'},
    {id:'media', label:'自媒体创作', route:'media'},
  ];
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'expectedRevision,focus,status,version'
      || value.version !== 1 || !['complete','skipped'].includes(value.status)
      || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0
      || !Array.isArray(value.focus) || value.focus.length > modules.length
      || new Set(value.focus).size !== value.focus.length
      || Array.from(value.focus).some(id => !modules.some(module => module.id === id))
      || value.status === 'complete' && !value.focus.length) throw Error('请选择有效的常用模块，再重试保存。');
    return {version:1, status:value.status, focus:modules.filter(module=>value.focus.includes(module.id)).map(module=>module.id), expectedRevision:value.expectedRevision};
  }
  function nickname(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 30) throw Error('称呼请填写 1～30 个字符，也可以保留默认称呼。');
    return value.trim();
  }
  function feedbackURL(kind, version, platform) {
    const feature = kind === 'feature';
    const safeVersion = typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version) ? version : '未提供';
    const system = {darwin:'macOS', win32:'Windows', linux:'Linux'}[platform] || '未提供';
    const body = `### 版本与系统\n- 本地版：${safeVersion}\n- 系统：${system}\n\n` + (feature
      ? '### 我想解决的问题\n请描述你遇到的具体场景。\n\n### 期望的改进\n\n'
      : '### 复现步骤\n1. \n2. \n\n### 预期结果\n\n### 实际结果\n\n') + '请在提交前检查内容；不要附上健康报告、备份、密钥或私人数据目录。';
    const url = new URL('https://github.com/jinyangtang33-sys/Hygieia/issues/new');
    url.searchParams.set('template', feature ? 'feature_request.md' : 'bug_report.md');
    url.searchParams.set('title', feature ? '[建议] ' : '[问题] ');
    url.searchParams.set('body', body);
    return url.href;
  }
  return {modules, normalize, nickname, feedbackURL};
})();
