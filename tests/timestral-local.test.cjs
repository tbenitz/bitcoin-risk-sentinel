const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),prep=require('../timestral-prep.js');
const ctx=Array.from({length:210},(_,i)=>70000+200*Math.sin(i/12)+i*.3);
test('Timestral ONNX input tensors have expected fixed 512 context and 32 forecast steps',()=>{
 const p=prep.prepare(ctx);assert.equal(p.scaled.length,1024);assert.equal(p.missing.length,1024);assert.equal(p.timeMask.length,2*17*17);assert.equal(p.variateMask.length,17*4);assert.equal(p.positions.length,34);
 assert.equal(p.missing.slice(0,302).reduce((a,b)=>a+b,0),302);for(const v of p.scaled)assert.ok(Number.isFinite(v));
});
test('Timestral postprocessor returns positive, ordered quantiles',()=>{
 const p=prep.prepare(ctx),mock=new Float32Array(2*32*21);for(let r=0;r<2;r++)for(let h=0;h<32;h++)for(let j=0;j<21;j++)mock[(r*32+h)*21+j]=(j-10)*.02;
 const o=prep.denormalize(mock,p);assert.equal(o.median.length,32);assert.equal(o.q10.length,32);assert.equal(o.q90.length,32);assert.ok(o.median.every(v=>v>0));assert.ok(o.q10.every((v,i)=>v<=o.median[i]&&o.median[i]<=o.q90[i]));
});
test('Model refuses fabricated empty or too-short histories',()=>{assert.throws(()=>prep.prepare([]));assert.throws(()=>prep.prepare(Array(16).fill(1)));});
test('New single-chart app requests local Timestral worker, not a model cloud API',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),worker=fs.readFileSync(path.join(__dirname,'../timestral-worker.js'),'utf8');
 assert.match(app,/new Worker\('\.\/timestral-worker\.js'\)/);assert.match(worker,/onnx-community\/Timestral-5M-ONNX/);
 assert.doesNotMatch(app,/Cloudflare|timestral-space|wrangler/);
});