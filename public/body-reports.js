'use strict';
const BodyReports=(()=>{
  const model=BodyReportModel,fields=model.fields;
  let imageFile=null,imageURL='',imageSize=null,activeWorker=null,busy=false,generation=0,scriptPromise=null;
  const records=()=>state.bodyReports||[];
  const latest=date=>records().filter(r=>r.measuredAt.slice(0,10)===date).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt))[0]||null;
  const dates=()=>[...new Set(records().map(r=>r.measuredAt.slice(0,10)))];
  const display=(v,f)=>v===undefined?'—':`${v>0&&['weightControl','muscleControl','fatControl'].includes(f.key)?'+':''}${num(v)}${f.unit?' '+f.unit:''}`;
  function panel(){const list=records().filter(r=>r.measuredAt.slice(0,10)<=selectedDate).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt)),r=list[0];return `<section id="body-report-center" class="panel body-report-center"><div class="panel-head"><div><h2>${icon('heart')}体脂秤报告</h2><p>导入身体成分，记录每一次测量。</p></div><button class="btn btn-primary" data-body-report="new">${icon('plus')}导入报告</button></div>${r?`<div class="body-report-date"><span>最近测量 ${esc(r.measuredAt.replace('T',' '))} · 北京时间</span><span>${esc(r.source)}</span></div><div class="body-report-summary">${['weight','bmi','bodyFatPercent','muscleMass'].map(k=>{const f=fields.find(f=>f.key===k);return `<div><span>${f.label}</span><strong>${r.metrics[k]===undefined?'—':num(r.metrics[k])}<small>${f.unit}</small></strong></div>`;}).join('')}</div><div class="body-report-history">${list.slice(0,5).map(v=>`<div><span>${esc(v.measuredAt.replace('T',' '))}<small>${esc(v.source)} · ${Object.keys(v.metrics).length} 项指标</small></span><button class="text-btn" data-body-report="edit" data-id="${v.id}">查看 / 修改 ${icon('arrow')}</button></div>`).join('')}</div>${list.length>5?`<p class="field-help">共 ${list.length} 份报告。可切换记录日期回看更早测量。</p>`:''}`:`<div class="body-report-empty"><p>上传健康秤报告截图，或导入报告 JSON、粘贴识别文字；核对后保存体重、体脂率、肌肉量等指标。</p><button class="text-btn" data-body-report="new">导入第一份报告 ${icon('arrow')}</button></div>`}<p class="body-report-help">截图在当前浏览器识别，原图仅作本机预览；保存已确认的数值到私人云端。体成分与 Apple 健康独立保存；当日已有 Apple 或手动体重时，报告不会覆盖它。</p></section>`;}
  function cleanup(){generation++;imageFile=null;imageSize=null;if(imageURL)URL.revokeObjectURL(imageURL);imageURL='';if(activeWorker)void activeWorker.terminate().catch(()=>{});activeWorker=null;busy=false;}
  function open(id=''){
    if(modal.open||recordDraftDirty)return;cleanup();const r=records().find(v=>v.id===id);if(id&&!r)return;
    const revisions=typeof PersonalSync!=='undefined'?PersonalSync.revisions(records().map(v=>'body-report/'+v.id)):{};
    modalShell(r?'核对 / 修改身体报告':'导入体脂秤报告','识别只是预填，请对照原报告核对后保存',`<form id="body-report-form" data-original="${r?.id||''}" data-revisions="${esc(JSON.stringify(revisions))}">${`<section class="body-import-source"><label class="body-file-label" for="body-report-file">选择截图或报告 JSON<input id="body-report-file" type="file" accept="image/jpeg,image/png,image/webp,application/json,.json"></label><p class="field-help">支持 JPG、PNG、WebP 截图，最大 12 MB。增强识别 v3：自动缩放并交叉复核；已保存的报告也可上传截图补齐空白。</p><div id="body-image-preview" hidden></div><div class="body-ocr-actions"><button class="btn" type="button" data-body-report="ocr" id="body-ocr-button" disabled>开始识别截图</button><label><input id="body-two-column" type="checkbox" checked>双列报告（如左右两栏指标）</label></div><p id="body-ocr-status" class="field-help" role="status"></p><details class="body-text-source"><summary>粘贴报告文字 / 查看识别结果</summary><p class="field-help">可使用手机图片中的「复制文字」后粘贴。识别与解析只填空白字段，保留已输入数值。</p><label for="body-report-text" class="sr-only">报告文字</label><textarea id="body-report-text" maxlength="100000" rows="5" placeholder="粘贴测量时间、指标名称与数值…"></textarea><button class="btn" type="button" data-body-report="parse">解析文字并预填</button></details></section>`}<div class="form-row">${field('测量时间（北京时间）','bodyMeasuredAt',r?.measuredAt||'',`required min="2000-01-01T00:00" max="${TODAY}T23:59" ${r?'readonly':''}`,'datetime-local')}${field('报告来源（品牌 / 设备）','bodySource',r?.source||'体脂秤','required maxlength="80"')}</div><div id="body-duplicate" class="body-duplicate" hidden><p>这个测量时间已有报告。核对表保存后将更新该报告，留空指标会移除。</p><label><input id="body-replace" type="checkbox">确认更新同一测量时间的报告</label></div><p class="field-help">留空表示未记录，不会按 0 计算；体重为必填。所有数值以原报告为准。</p><div class="body-metric-fields">${fields.map(f=>field(`${f.label}${f.unit?' / '+f.unit:''}`,'body-'+f.key,r?.metrics[f.key]??'',`${f.key==='weight'?'required':''} min="${f.min}" max="${f.max}" step="any" placeholder="未记录"`,'number')).join('')}</div><div class="form-field"><label for="body-report-notes">备注（选填）</label><textarea id="body-report-notes" name="bodyNotes" maxlength="1000" rows="3">${esc(r?.notes||'')}</textarea></div><p class="field-help">报告中的“标准体重”“身体年龄”和控制建议等会按原数值记录；页面不据此生成诊断或增减重建议。</p><label class="body-verified"><input id="body-verified" type="checkbox" required>我已对照原报告核对测量时间、数值和单位</label><p id="body-report-error" class="backup-error" role="status"></p>${submitFooter(r?'保存修改':'确认导入')}</form>`);
  }
  function duplicate(){const form=$('#body-report-form');if(!form||!form.dataset)return null;const time=$('#f-bodyMeasuredAt').value,id=model.idFor(time),existing=records().find(r=>r.id===id),needs=existing&&form.dataset.original!==id;$('#body-duplicate').hidden=!needs;$('#body-replace').required=!!needs;return needs?existing:null;}
  function apply(result){
    const form=$('#body-report-form');if(!form)return;let filled=0;
    if(form.dataset.original&&result.measuredAt&&model.idFor(result.measuredAt)!==form.dataset.original){$('#body-ocr-status').textContent='截图测量时间与当前报告不同，未预填。请关闭后用「导入报告」新建，或选择同一次测量的截图。';return null;}
    if(!$('#f-bodyMeasuredAt').value&&result.measuredAt){$('#f-bodyMeasuredAt').value=result.measuredAt;filled++;}
    for(const f of fields){const input=$('#f-body-'+f.key);if(input&&input.value===''&&result.metrics[f.key]!==undefined){input.value=String(result.metrics[f.key]);filled++;}}
    if(!$('#body-report-notes').value&&result.notes)$('#body-report-notes').value=result.notes;
    if($('#f-bodySource').value==='体脂秤'&&result.source)$('#f-bodySource').value=result.source;
    recordDraftDirty=true;if(typeof DraftCenter!=='undefined')DraftCenter.capture(form);duplicate();$('#body-verified').checked=false;
    const status=$('#body-ocr-status');if(status)status.textContent=`已预填 ${Object.keys(result.metrics).length} 项可识别指标，仅写入空白字段。请逐项核对。${(result.warnings||[]).join(' ')}`;
    return filled;
  }
  async function choose(file){
    if(!file||busy)return;const token=++generation;if(imageURL)URL.revokeObjectURL(imageURL);imageURL='';imageFile=null;imageSize=null;$('#body-image-preview').hidden=true;$('#body-ocr-button').disabled=true;
    try{
      if(file.size>12*1024*1024)throw Error('文件超过 12 MB，请压缩截图或分开导入。');
      if(file.type==='application/json'||/\.json$/i.test(file.name)){const value=model.parseFile(JSON.parse(await file.text()));if(token===generation)apply(value);return;}
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG、WebP 截图或报告 JSON。');
      const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>24000000||img.naturalWidth<100||img.naturalHeight<100)throw Error('截图尺寸不适合识别，请使用清晰的原始截图，像素总量不超过 2400 万。');if(token!==generation){URL.revokeObjectURL(url);return;}imageURL=url;imageFile=file;imageSize={width:img.naturalWidth,height:img.naturalHeight};}catch(e){URL.revokeObjectURL(url);throw e;}
      $('#body-image-preview').innerHTML=`<img src="${imageURL}" alt="本机报告预览，不会上传原图">`;$('#body-image-preview').hidden=false;$('#body-ocr-button').disabled=false;$('#body-ocr-status').textContent='截图已在本机打开。点击开始识别，或直接手动填写。';recordDraftDirty=true;
    }catch(e){if(token===generation&&$('#body-ocr-status'))$('#body-ocr-status').textContent=e.message||'文件无法读取，请换一张清晰截图。';}
  }
  function loadOCR(){if(typeof Tesseract!=='undefined')return Promise.resolve(Tesseract);if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/body-ocr/tesseract.min.js';script.onload=()=>resolve(Tesseract);script.onerror=()=>{scriptPromise=null;script.remove();reject(Error('识别组件暂时无法加载，可先粘贴文字或手动填写。'));};document.head.append(script);});return scriptPromise;}
  function prepareImage(image,maxWidth=1600){const target=image.naturalWidth<1000?1400:image.naturalWidth;const scale=Math.min(target/image.naturalWidth,maxWidth/image.naturalWidth,Math.sqrt(8000000/(image.naturalWidth*image.naturalHeight))),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;}
  function grayscale(canvas,threshold=null){const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);const im=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<im.data.length;i+=4){let gray=Math.round(im.data[i]*.2126+im.data[i+1]*.7152+im.data[i+2]*.0722);if(threshold!==null)gray=gray<threshold?0:255;im.data[i]=im.data[i+1]=im.data[i+2]=gray;im.data[i+3]=255;}ctx.putImageData(im,0,0);return c;}
  function numberCanvas(canvas,region,height=120,threshold=null){const c=document.createElement('canvas'),scale=height/region.height;c.width=Math.round(region.width*scale)+32;c.height=height+32;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,region.left,region.top,region.width,region.height,16,16,c.width-32,height);return grayscale(c,threshold);}
  async function recognize(){
    if(busy||!imageFile)return;busy=true;const token=generation,url=imageURL,twoColumn=$('#body-two-column').checked;let worker=null,phase='准备识别';
    const current=()=>token===generation&&!!$('#body-report-form');const status=t=>{if(current())$('#body-ocr-status').textContent=t;};$('#body-ocr-button').disabled=true;$('#body-report-file').disabled=true;
    try{
      status('正在加载本机识别组件…');const engine=await loadOCR();if(!current())return;
      const image=new Image();image.src=url;await image.decode();const canvas=prepareImage(image),binary=grayscale(canvas,235);
      worker=await engine.createWorker('chi_sim+eng',1,{workerPath:'/vendor/body-ocr/worker.min.js',corePath:'/vendor/body-ocr/core',langPath:'/vendor/body-ocr/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')status(`${phase} ${Math.round((m.progress||0)*100)}%…`);}});
      if(!current())return;activeWorker=worker;phase='定位指标与测量时间';await worker.setParameters({tessedit_pageseg_mode:'11',user_defined_dpi:'150'});
      let first=await worker.recognize(binary,{}, {text:true,tsv:true});if(!current())return;
      let layout=twoColumn?BodyLayout.detect(first.data.tsv,canvas.width,canvas.height,fields):null;
      if(twoColumn&&!layout){for(const threshold of [210,null]){phase='增强定位指标';const retry=await worker.recognize(grayscale(canvas,threshold),{}, {text:true,tsv:true});if(!current())return;layout=BodyLayout.detect(retry.data.tsv,canvas.width,canvas.height,fields);if(layout){first=retry;break;}}}let result;
      if(layout){
        result={measuredAt:model.parseText(first.data.text).measuredAt,metrics:{},warnings:[],layout:true};const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        await worker.reinitialize('eng',1);let done=0;
        for(const box of layout.cells){if(!current())return;const field=fields.find(f=>f.key===box.key),region=BodyLayout.numberRegion(pixels,canvas.width,canvas.height,box);phase=`逐项识别 ${++done}/${layout.cells.length} · ${field.label}`;status(phase);if(!region)continue;const groups=[];
          for(const [height,threshold] of [[120,null],[120,210],[90,null]]){const cell=numberCanvas(canvas,region,height,threshold),values=[];
            for(const mode of ['7','8','13']){await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789'});const read=await worker.recognize(cell);if(!current())return;values.push(BodyLayout.restoreNumber(read.data.text,region));}groups.push(values);
          }
          const value=BodyLayout.crossCheck(groups);if(value!==null&&value>=field.min&&value<=field.max)result.metrics[box.key]=value;
        }
        const missing=fields.filter(f=>result.metrics[f.key]===undefined);if(missing.length)result.warnings.push('仍需手动核对 / 补填：'+missing.map(f=>f.label).join('、')+'。');
        if(!result.measuredAt)result.warnings.push('未识别到测量时间，请手动填写。');
      }else if(twoColumn){
        const halves=[];await worker.setParameters({tessedit_pageseg_mode:'6'});for(const side of [0,1]){phase=`识别${side?'右':'左'}列`;const left=side?Math.floor(canvas.width/2):0,width=side?canvas.width-left:Math.floor(canvas.width/2);const read=await worker.recognize(binary,{rectangle:{left,top:0,width,height:canvas.height}});if(!current())return;halves.push(model.parseText(read.data.text));}
        result={measuredAt:model.parseText(first.data.text).measuredAt,metrics:{},warnings:['未匹配到完整双列布局，已使用通用识别。请逐项核对，漏项需补填。']};for(const f of fields){const values=halves.map(r=>r.metrics[f.key]).filter(v=>v!==undefined);if(new Set(values).size===1)result.metrics[f.key]=values[0];}
      }else result=model.parseText(first.data.text);
      if(!current())return;$('#body-report-text').value=[result.measuredAt?.replace('T',' ')||'',...fields.filter(f=>result.metrics[f.key]!==undefined).map(f=>f.label+' '+result.metrics[f.key]+f.unit)].join('\n');const filled=apply(result);if(filled===null)return;const count=Object.keys(result.metrics).length,missing=fields.filter(f=>!$('#f-body-'+f.key).value.trim());
      status(`识别完成：${count}/${fields.length} 项指标，${result.measuredAt?'已识别测量时间':'测量时间待补填'}；本次预填 ${filled} 个空白字段。${result.layout?'已逐项定位，经三种图像处理交叉复核数字、小数点与符号。':''}${missing.length?'表单仍有 '+missing.length+' 项待补：'+missing.map(f=>f.label).join('、')+'。':'表单 23 项已齐全。'}请对照原图核对后保存。${(result.warnings||[]).join(' ')}`);
    }catch(e){if(current())status('截图识别未完成。可粘贴图片文字，或对照截图手动填写；尚未保存任何识别结果。');}
    finally{if(worker)await worker.terminate().catch(()=>{});if(activeWorker===worker)activeWorker=null;if(current()){busy=false;const b=$('#body-ocr-button'),f=$('#body-report-file');if(b)b.disabled=!imageFile;if(f)f.disabled=false;}}
  }
  function fromForm(form){const f=new FormData(form),metrics={};for(const field of fields){const raw=f.get('body-'+field.key);if(raw!==null&&String(raw).trim()!=='')metrics[field.key]=Number(raw);}return {measuredAt:String(f.get('bodyMeasuredAt')||''),source:String(f.get('bodySource')||'').trim(),notes:String(f.get('bodyNotes')||''),metrics};}
  function save(form){
    if(busy){toast('请等待识别完成后再核对保存。');return false;}duplicate();if(!form.reportValidity())return false;checkDayChange(false);
    const value=fromForm(form),id=model.idFor(value.measuredAt),existing=records().find(r=>r.id===id),now=new Date().toISOString(),r={id,...value,createdAt:existing?.createdAt||now,updatedAt:now};
    if(!model.valid(r)||r.measuredAt.slice(0,10)>TODAY||form.dataset.original&&form.dataset.original!==id){$('#body-report-error').textContent='请核对测量时间、必填体重和各项数值范围。已有报告的测量时间不能修改。';return false;}
    if(existing&&form.dataset.original!==id&&!$('#body-replace').checked){$('#body-report-error').textContent='这个时间已有报告，请先确认是否更新。';return false;}
    const next=structuredClone(state);next.bodyReports||=[];const i=next.bodyReports.findIndex(v=>v.id===id);if(i<0)next.bodyReports.push(r);else next.bodyReports[i]=r;
    if(!persist(next,'身体报告已保存，正在同步。',{baseRevisions:JSON.parse(form.dataset.revisions||'{}')}))return false;
    closeModal(true);setDate(r.measuredAt.slice(0,10));return true;
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-body-report]');if(!b)return;const action=b.dataset.bodyReport;if(action==='new')open();if(action==='edit')open(b.dataset.id);if(action==='ocr')void recognize();if(action==='parse'){try{apply(model.parseText($('#body-report-text').value));}catch{toast('文字解析未完成，请检查粘贴内容。',true);}}});
  document.addEventListener('change',e=>{if(e.target.id==='body-report-file'){const file=e.target.files?.[0];e.target.value='';void choose(file);}if(e.target.closest?.('#body-report-form')){recordDraftDirty=true;if(e.target.id==='f-bodyMeasuredAt'){$('#body-replace').checked=false;duplicate();}}});
  document.addEventListener('input',e=>{if(e.target.closest?.('#body-report-form')){recordDraftDirty=true;if(e.target.id!=='body-verified')$('#body-verified').checked=false;}});
  document.addEventListener('submit',e=>{if(e.target.id==='body-report-form'){e.preventDefault();save(e.target);}});
  document.addEventListener('DOMContentLoaded',()=>{modal.addEventListener('close',cleanup);});
  return {panel,records,dates,latest,open,apply,choose,recognize,fromForm,save};
})();
