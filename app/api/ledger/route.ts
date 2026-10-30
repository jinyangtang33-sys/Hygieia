import {database,identity,json,sameOrigin,readJSON,hashToken} from '../../../lib/health-api';
import {stable,validatePersonalValue} from '../../../lib/personal-format.mjs';
class LedgerInputError extends Error {}
export async function POST(request:Request){
 const user=identity(request);if(!user)return json({error:'请登录后记账。'},401);if(!sameOrigin(request))return json({error:'请从当前私人站点操作。'},403);
 try{
  const body=await readJSON(request,12000);if('error'in body)return json({error:body.error},body.status);
  const b=body.data,id=typeof b?.id==='string'&&/^[a-zA-Z0-9_.:-]{1,90}$/.test(b.id)?b.id:null;
  if(!id||b.owner!==user)return json({error:'账号或请求标识无效。'},403);
  const db=database(),hash=await hashToken(stable(b)),marker='ledger-'+id;
  const prior=await db.prepare('SELECT op_hash,result FROM personal_mutations WHERE user_id=? AND mutation_id=?').bind(user,marker).first<any>();
  if(prior)return prior.op_hash===hash?json(JSON.parse(prior.result)):json({error:'请求标识已使用。'},409);
  const cents=(n:any)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e12||Math.abs(n*100-Math.round(n*100))>.001)throw new LedgerInputError('金额需要是非负数，最多保留两位小数。');return Math.round(n*100);};
  if(!['收入','支出','转账','核对','撤销'].includes(b.type)||typeof b.description!=='string'||b.description.length>160)throw new LedgerInputError('记账内容无效。');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||Number.isNaN(Date.parse(b.date+'T12:00:00Z'))||new Date(b.date+'T12:00:00Z').toISOString().slice(0,10)!==b.date||b.date>today||b.date<'2000-01-01')throw new LedgerInputError('请选择有效的记录日期。');
  let original:any=null;
  if(b.type==='撤销'){
   const row=await db.prepare('SELECT value FROM personal_records WHERE user_id=? AND record_key=?').bind(user,'ledger/'+String(b.originalId)).first<any>();original=row?.value?JSON.parse(row.value):null;
   if(!original||original.type==='撤销')throw new LedgerInputError('这条记录不能撤销。');
   const reversed=await db.prepare("SELECT 1 FROM personal_records WHERE user_id=? AND record_key LIKE 'ledger/%' AND json_extract(value,'$.originalId')=?").bind(user,original.id).first();if(reversed)return json({error:'这条记录已经撤销，请刷新。'},409);
  }
  const ids=original?original.effects.map((e:any)=>e.id):b.type==='转账'?[b.accountId,b.toAccountId]:[b.accountId];
  if(ids.length!==new Set(ids).size||ids.some((x:any)=>typeof x!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(x)))throw new LedgerInputError('请选择不同的有效账户。');
  const rows=await Promise.all(ids.map((aid:string)=>db.prepare('SELECT value,revision FROM personal_records WHERE user_id=? AND record_key=?').bind(user,'account/'+aid).first<any>()));
  if(rows.some((r:any)=>!r?.value))return json({error:'账户已删除，请刷新后重新选择。'},409);
  const accounts=rows.map((r:any)=>JSON.parse(r.value));
  if(rows.some((r:any,i:number)=>b.revisions?.['account/'+ids[i]]!==r.revision))return json({error:'账户余额已被其他操作更新。请关闭表单，刷新后重新核对。'},409);
  if(accounts.some((a:any)=>a.type==='负债')&&!['核对','撤销'].includes(b.type))throw new LedgerInputError('负债账户请通过余额核对更新；收支和转账请选择资产账户。');
  const amount=cents(b.amount);if(!['核对','撤销'].includes(b.type)&&amount===0)throw new LedgerInputError('金额需要大于零。');
  const effects=accounts.map((a:any,i:number)=>{
   let after:number;
   if(b.type==='核对')after=amount/100;
   else {const before=cents(a.balance),delta=b.type==='撤销'?Math.round((original.effects[i].before-original.effects[i].after)*100):b.type==='收入'?amount:b.type==='支出'?-amount:i===0?-amount:amount;after=(before+delta)/100;}
   if(after<0||after>1e12)throw new LedgerInputError('余额不足或超过记录上限，请核对账户余额。');
   return {id:a.id,name:a.name,before:a.balance,after};
  });
  const event:any={id,createdAt:new Date().toISOString(),date:b.date,type:b.type,description:b.description,amount:b.type==='撤销'?original.amount:amount/100,effects};if(['收入','支出'].includes(b.type)){if(typeof b.category==='string'&&b.category.length<=60)event.category=b.category;}if(original)event.originalId=original.id;
  validatePersonalValue('ledger/'+id,event);
  const now=new Date().toISOString(),out={ok:true,eventId:id};
  // All guards, balance updates, immutable event and receipt commit in one D1 transaction.
  const guards=ids.map(()=>"EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND record_key=? AND revision=? AND value IS ?)");
  const args:any[]=[user,marker,hash,'ledger/'+id];ids.forEach((aid:string,i:number)=>args.push(user,'account/'+aid,rows[i].revision,rows[i].value));
  let guard=guards.join(' AND ')+" AND NOT EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND record_key=?)";args.push(user,'ledger/'+id);if(original){guard+=" AND NOT EXISTS(SELECT 1 FROM personal_records WHERE user_id=? AND record_key LIKE 'ledger/%' AND json_extract(value,'$.originalId')=?)";args.push(user,original.id);}
  const statements=[db.prepare(`INSERT OR IGNORE INTO personal_mutations(user_id,mutation_id,op_hash,record_key,result) SELECT ?,?,?,?,'pending' WHERE ${guard}`).bind(...args)];
  const active="EXISTS(SELECT 1 FROM personal_mutations WHERE user_id=? AND mutation_id=? AND result='pending')";
  accounts.forEach((a:any,i:number)=>statements.push(db.prepare(`UPDATE personal_records SET value=?,revision=revision+1,updated_at=? WHERE user_id=? AND record_key=? AND ${active}`).bind(stable({...a,balance:effects[i].after}),now,user,'account/'+a.id,user,marker)));
  statements.push(db.prepare(`INSERT INTO personal_records(user_id,record_key,value,revision,updated_at) SELECT ?,?,?,1,? WHERE ${active}`).bind(user,'ledger/'+id,stable(event),now,user,marker));
  statements.push(db.prepare("UPDATE personal_mutations SET result=? WHERE user_id=? AND mutation_id=? AND result='pending'").bind(stable(out),user,marker));
  statements.push(db.prepare('SELECT op_hash,result FROM personal_mutations WHERE user_id=? AND mutation_id=?').bind(user,marker));
  const results=await db.batch(statements),receipt=results.at(-1)!.results[0] as any;
  if(!receipt)return json({error:'余额或记账状态已变化，请刷新后重新核对。'},409);
  return receipt.op_hash===hash?json(JSON.parse(receipt.result)):json({error:'请求标识已使用。'},409);
 }catch(e){return json({error:e instanceof LedgerInputError?e.message:'云端暂时无法确认，请使用原请求重试。'},e instanceof LedgerInputError?422:503);}
}
