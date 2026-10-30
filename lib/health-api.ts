import {env} from 'cloudflare:workers';

export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});}
export function database(){if(!env.DB)throw new Error('DATABASE_UNAVAILABLE');return env.DB;}
export function identity(request:Request){return request.headers.get('oai-authenticated-user-id');}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin;}
export async function hashToken(token:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
export async function readJSON(request:Request,max=2*1024*1024){
  if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return {error:'请使用 JSON 格式导出。',status:415} as const;
  if(Number(request.headers.get('content-length')||0)>max)return {error:'本次上传超过 2 MB，请使用按天汇总并缩短日期范围。',status:413} as const;
  const reader=request.body?.getReader();if(!reader)return {error:'请求内容为空。',status:400} as const;
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();return {error:'本次上传超过 2 MB，请缩短导出范围。',status:413} as const;}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return {data:JSON.parse(new TextDecoder().decode(bytes))} as const;}catch{return {error:'JSON 内容无效。',status:400} as const;}
}
