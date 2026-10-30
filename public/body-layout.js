function createBodyLayout(){
  const left=['bmi','bodyFatPercent','waterPercent','musclePercent','proteinPercent','skeletalMusclePercent','basalMetabolism','boneMass','score','bodyAge','muscleControl'];
  const right=['standardWeight','fatMass','waterMass','muscleMass','proteinMass','skeletalMuscleMass','visceralFat','leanMass','obesityPercent','weightControl','fatControl'];
  const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  function lines(tsv){const groups=new Map();for(const row of String(tsv||'').split('\n').slice(1)){const a=row.split('\t');if(a[0]!=='5'||a.length<12)continue;const text=a.slice(11).join('\t').trim();if(!text)continue;const x=Number(a[6]),y=Number(a[7]),w=Number(a[8]),h=Number(a[9]);if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)continue;const id=a.slice(1,5).join('/'),g=groups.get(id)||{text:'',x,y,right:x+w,bottom:y+h};g.text+=text;g.x=Math.min(x,g.x);g.y=Math.min(y,g.y);g.right=Math.max(x+w,g.right);g.bottom=Math.max(y+h,g.bottom);groups.set(id,g);}return [...groups.values()].map(g=>({...g,text:g.text.normalize('NFKC').replace(/\s/g,'').toUpperCase()}));}
  function detect(tsv,width,height,fields){
    const words=lines(tsv),matches=[];
    for(const line of words){let choices=[];for(const f of fields)for(const a of f.aliases){if(line.text.includes(a.toUpperCase()))choices.push({key:f.key,length:a.length});}choices.sort((a,b)=>b.length-a.length);if(choices[0])matches.push({...line,key:choices[0].key});}
    const bmi=matches.find(v=>v.key==='bmi'&&v.x<width*.5),standard=matches.find(v=>v.key==='standardWeight'&&v.x>width*.5);if(!standard||(bmi&&Math.abs(bmi.y-standard.y)>height*.025))return null;
    const y=bmi?median([bmi.y,standard.y]):standard.y,anchors=[];
    for(const m of matches){const keys=m.x<width*.5?left:right,index=keys.indexOf(m.key);if(index>=0&&m.y>=y-height*.01)anchors.push({...m,index});}
    const estimates=anchors.filter(v=>v.index>0).map(v=>(v.y-y)/v.index).filter(v=>v>height*.035&&v<height*.1);if(estimates.length<6)return null;const step=median(estimates),good=anchors.filter(v=>Math.abs(v.y-(y+v.index*step))<step*.18),seen=new Set(good.map(v=>v.key));
    if(seen.size<10||good.filter(v=>v.x<width*.5).length<4||good.filter(v=>v.x>width*.5).length<4||good.length<anchors.length*.85||y+10.75*step>height)return null;
    const cells=[];for(const [keys,x0,x1] of [[left,.055,.34],[right,.535,.84]])keys.forEach((key,i)=>cells.push({key,left:Math.round(width*x0),top:Math.round(y+i*step+step*.25),width:Math.round(width*(x1-x0)),height:Math.round(step*.46)}));
    const header=matches.find(v=>v.key==='weight'&&v.y<y*.65&&v.text.includes('当前体重'));
    if(header)cells.push({key:'weight',left:Math.round(width*.055),top:Math.round(header.bottom+width*.01),width:Math.round(width*.40),height:Math.round(Math.min(y*.52-header.bottom,width*.2))});
    return {cells,anchors:seen.size,rows:11};
  }
  function trim(data,width,height,box){let x0=width,y0=height,x1=-1,y1=-1;for(let y=Math.max(0,box.top);y<Math.min(height,box.top+box.height);y++)for(let x=Math.max(0,box.left);x<Math.min(width,box.left+box.width);x++){const at=(y*width+x)*4;if((data[at]+data[at+1]+data[at+2])/3<180){x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);}}if(x1<0||y1-y0<5)return null;const pad=5;return {left:Math.max(0,x0-pad),top:Math.max(0,y0-pad),width:Math.min(width-1,x1+pad)-Math.max(0,x0-pad)+1,height:Math.min(height-1,y1+pad)-Math.max(0,y0-pad)+1};}
  function numberRegion(data,width,height,box){
    const b=trim(data,width,height,box);if(!b)return null;const mask=new Uint8Array(b.width*b.height),components=[];
    for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const at=((y+b.top)*width+x+b.left)*4;mask[y*b.width+x]=(data[at]+data[at+1]+data[at+2])/3<180?1:0;}
    for(let i=0;i<mask.length;i++){if(!mask[i])continue;mask[i]=0;const queue=[i];let x0=i%b.width,x1=x0,y0=Math.floor(i/b.width),y1=y0,count=0;for(let q=0;q<queue.length;q++){const at=queue[q],x=at%b.width,y=Math.floor(at/b.width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*b.width+xx;if(xx>=0&&xx<b.width&&yy>=0&&yy<b.height&&mask[n]){mask[n]=0;queue.push(n);}}}if(count>=3)components.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count});}
    if(!components.length)return null;const tallest=components.reduce((a,v)=>v.h>a.h?v:a),h=tallest.h,top=tallest.y;
    const digits=components.filter(v=>v.h>=h*.72&&v.y<=top+h*.18&&v.w>=h*.07).sort((a,b)=>a.x-b.x);if(!digits.length||digits.length>7)return null;
    const first=digits[0],last=digits.at(-1),dots=components.filter(v=>v.h<=h*.23&&v.w<=h*.23&&v.y>=top+h*.65&&v.x>first.x&&v.x<last.x);if(dots.length>1)return null;
    const dot=dots[0],decimalAfter=dot?digits.filter(d=>d.x+d.w/2<dot.x+dot.w/2).length:null;
    const sign=components.find(v=>v.x+v.w<first.x&&v.w>h*.2&&v.y>top+h*.15&&v.y<top+h*.8);
    return {left:b.left+first.x-2,top:b.top+top-2,width:last.x+last.w-first.x+4,height:h+4,digitCount:digits.length,decimalAfter,sign:sign&&sign.h<sign.w*.35?-1:1};
  }
  function restoreNumber(text,region){if(!/^[0-9\s]+$/.test(String(text||'')))return null;const digits=String(text).replace(/\s/g,'');if(digits.length!==region.digitCount)return null;const at=region.decimalAfter,number=at===null?digits:digits.slice(0,at)+'.'+digits.slice(at);return region.sign*Number(number);}
  function consensus(values){const valid=values.filter(v=>typeof v==='number'&&Number.isFinite(v));return valid.find(v=>valid.filter(n=>n===v).length>=2)??null;}
  function crossCheck(groups){const candidates=[...new Set(groups.flat().filter(v=>typeof v==='number'&&Number.isFinite(v)))],agreed=candidates.filter(v=>groups.filter(group=>group.includes(v)).length>=2);return agreed.length===1?agreed[0]:null;}
  function numeric(text){const s=String(text).normalize('NFKC').replace(/[−–—]/g,'-').replace(/\s/g,'');const m=s.match(/^([+-]?\d+(?:\.\d+)?)(?:%|kg|kcal)?$/i);return m?Number(m[1]):null;}
  return {detect,lines,trim,numeric,numberRegion,restoreNumber,consensus,crossCheck};
}
const BodyLayout=createBodyLayout();
