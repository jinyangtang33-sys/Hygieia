import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=process.cwd(),skip=new Set(['.git','node_modules','dist','.next','.vinext','.wrangler','.sites-runtime','.bridge-runtime','__pycache__','coverage']);
const problems=[];
let files=[];
try{files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);}catch{}
if(!files.length){
  function walk(dir=''){for(const d of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(skip.has(d.name))continue;const rel=path.posix.join(dir,d.name);if(d.isSymbolicLink()){problems.push([rel,'unexpected symlink']);continue;}if(d.isDirectory())walk(rel);else files.push(rel);}}
  walk();
}
const signatures=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{30,255})\b/],
  ['API token',/\bsk-[A-Za-z0-9_-]{24,255}\b/],
  ['push credential',/\bSCT\d{5,20}[A-Za-z0-9]{10,100}\b/],
  ['health credential',/\bhax_[a-f0-9]{64}\b/],
  ['private deployment ID',/\bappgprj_[a-f0-9]{32}\b/],
  ['private site URL',/https?:\/\/[^\s/"'<>]{1,180}\.chatgpt\.site/],
  ['personal machine path',/\/(?:Users|home)\/[A-Za-z0-9_.-]{1,100}\//],
];
for(const rel of files){
  const parts=rel.split('/'),file=path.join(root,rel);
  if(parts.some(p=>skip.has(p))||/\.(?:sqlite(?:-.*)?|db(?:-.*)?|pem|key|p12|pfx|tsbuildinfo|log|pyc)$/.test(rel)||/(^|\/)\.env(?:\.|$)/.test(rel)&&!rel.endsWith('.example')||/(^|\/)\.dev\.vars/.test(rel)&&!rel.endsWith('.example'))problems.push([rel,'runtime or credential file']);
  if(!fs.existsSync(file)){problems.push([rel,'missing source file']);continue;}
  if(fs.lstatSync(file).isSymbolicLink()){problems.push([rel,'tracked symlink']);continue;}
  // Fixed upstream OCR assets are verified byte-for-byte below, not scanned as
  // minified text. No generated output, screenshot or runtime data is allowed.
  if(rel.startsWith('public/vendor/body-ocr/'))continue;
  const bytes=fs.readFileSync(file);if(bytes.includes(0))continue;
  if(bytes.length>2*1024*1024){problems.push([rel,'unexpected large text file']);continue;}
  const s=bytes.toString('utf8');for(const [label,rx]of signatures)if(rx.test(s))problems.push([rel,label]);
}
const manifest=JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'));
if(manifest.project_id!=='REPLACE_WITH_YOUR_SITE_PROJECT_ID')problems.push(['.openai/hosting.json','replace private deployment identity before public distribution']);
const base='public/vendor/body-ocr',hashes=JSON.parse(fs.readFileSync(path.join(base,'SHA256SUMS.json'),'utf8'));
for(const [name,expected]of Object.entries(hashes)){
  const file=path.join(base,name);
  if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)problems.push([file,'OCR asset checksum mismatch']);
}
if(!fs.readFileSync('LICENSE','utf8').startsWith('MIT License'))problems.push(['LICENSE','expected MIT license']);
if(problems.length){console.error('Public source audit failed (values are not printed):');for(const [f,reason]of problems)console.error(`${f}: ${reason}`);process.exitCode=1;}
else console.log(`PASS public source audit: ${files.length} files; private deployment markers and known credential patterns absent; ${Object.keys(hashes).length} OCR checksums verified.`);
