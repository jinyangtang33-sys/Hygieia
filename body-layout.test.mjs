import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bodyLayout} from './lib/body-layout.mjs';
import {bodyModel} from './lib/body-format.mjs';

test('layout requires two aligned columns and sufficient independent label anchors',()=>{
  const left=['bmi','bodyFatPercent','waterPercent','musclePercent','proteinPercent','skeletalMusclePercent','basalMetabolism','boneMass','score','bodyAge','muscleControl'];
  const right=['standardWeight','fatMass','waterMass','muscleMass','proteinMass','skeletalMuscleMass','visceralFat','leanMass','obesityPercent','weightControl','fatControl'];
  const rows=[['level','page_num','block_num','par_num','line_num','word_num','left','top','width','height','conf','text'].join('\t')];
  for(const [column,keys] of [left,right].entries())keys.forEach((key,index)=>rows.push([5,1,column+1,1,index+1,1,column?550:70,800+index*250,120,30,95,bodyModel.fields.find(f=>f.key===key).aliases[0]].join('\t')));
  const tsv=rows.join('\n'),layout=bodyLayout.detect(tsv,1000,3600,bodyModel.fields);
  assert.equal(layout?.anchors,22);assert.equal(layout.cells.length,22);
  assert.equal(bodyLayout.detect(rows.slice(0,7).join('\n'),1000,3600,bodyModel.fields),null);
  assert.equal(bodyLayout.detect(tsv.replaceAll('\t550\t','\t70\t'),1000,3600,bodyModel.fields),null);
});

test('geometry restores actual decimal positions and signs; OCR disagreement stays blank',()=>{
  const region={digitCount:3,decimalAfter:1,sign:-1};
  assert.equal(bodyLayout.restoreNumber('275\n',region),-2.75);
  assert.equal(bodyLayout.restoreNumber('27',region),null);
  assert.equal(bodyLayout.restoreNumber('2.75',region),null);
  assert.equal(bodyLayout.consensus([null,-2.75,-2.75]),-2.75);
  assert.equal(bodyLayout.consensus([0,0,null]),0);
  assert.equal(bodyLayout.consensus([2,3,null]),null);
});

test('browser and server use the same layout detector',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('public/body-layout.js','utf8')+';result=BodyLayout.consensus([8,9,9]);',context);assert.equal(context.result,9);
  const source=fs.readFileSync('lib/body-layout.mjs','utf8').replace('export function createBodyLayout','function createBodyLayout').replace('export const bodyLayout=createBodyLayout();','const BodyLayout=createBodyLayout();');
  assert.equal(fs.readFileSync('public/body-layout.js','utf8'),source);
});

test('cross-check needs agreement across image treatments rather than repeated segmentation',()=>{
  assert.equal(bodyLayout.crossCheck([[15,15,15],[null,null,null],[null,null,null]]),null);
  assert.equal(bodyLayout.crossCheck([[null,null,null],[15,15,null],[15,null,null]]),15);
  assert.equal(bodyLayout.crossCheck([[15,16,null],[15,null,null],[16,null,null]]),null);
  assert.equal(bodyLayout.crossCheck([[0,null,null],[0,null,null],[]]),0);
});
