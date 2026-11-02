const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prep=require('../timestral-prep.js');
const ctx=Array.from({length:210},(_,i)=>70000+200*Math.sin(i/12)+i*0.3);
test('local Timestral prepares two mirrored rows and correct ONNX tensor shapes',()=>{
 const p=prep.prepare(ctx);
 assert.equal(p.scaled.length,1024);
 assert.equal(p.missing.length,1024);
 assert.equal(p.timeMask.length,2*17*17);
 assert.equal(p.variateMask.length,17*4);
 assert.equal(p.positions.length,34);
 assert.equal(p.missing.slice(0,302).reduce((a,b)=>a+b,0),302);
 assert.equal(p.nonnegative,true);
 assert.equal(p.positions[16],16n-9n);
 for(const v of p.scaled)assert.ok(Number.isFinite(v));
});
test('local model postprocessing returns 32 price forecasts in quantile order',()=>{
 const p=prep.prepare(ctx);
 const mock=new Float32Array(2*32*21);
 for(let r=0;r<2;r++)for(let h=0;h<32;h++)for(let j=0;j<21;j++)mock[(r*32+h)*21+j]=(j-10)*0.02;
 const o=prep.denormalize(mock,p);
 assert.equal(o.median.length,32);
 assert.equal(o.q10.length,32);
 assert.equal(o.q90.length,32);
 assert.ok(o.median.every(v=>v>0));
 assert.ok(o.q10.every((v,i)=>v<=o.median[i]&&o.median[i]<=o.q90[i]));
});
test('local model refuses empty/fabricated inputs',()=>{assert.throws(()=>prep.prepare([]));assert.throws(()=>prep.prepare(new Array(16).fill(1)));});
test('dashboard loads actual local worker; no Timestral Space URL field',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../forecast-ui.js'),'utf8');
 const worker=fs.readFileSync(path.join(__dirname,'../timestral-worker.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(ui,/new Worker\('\.\/timestral-worker\.js'\)/);
 assert.doesNotMatch(ui,/Timestral API base URL|Timestral Space endpoint|opts\.endpoint/);
 assert.match(worker,/onnx-community\/Timestral-5M-ONNX/);
 assert.equal((html.match(/<\/html>/g)||[]).length,1);
});