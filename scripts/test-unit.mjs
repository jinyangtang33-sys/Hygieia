import {spawnSync} from 'node:child_process';
const files=[
  'backup-format.test.mjs','body-layout.test.mjs','body-reports.test.mjs',
  'body-trends.test.mjs','bridge-format.test.mjs','bridge-status.test.mjs',
  'checklist.test.mjs','fitness.test.mjs','focus-timer.test.mjs',
  'health-format.test.mjs','media-accounts.test.mjs','media-history.test.mjs',
  'media-topics.test.mjs','quality-drafts.test.mjs','quality-ui.test.mjs',
  'search.test.mjs','self-media.test.mjs','tasks.test.mjs',
];
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(r.error)throw r.error;
process.exitCode=r.status??1;
