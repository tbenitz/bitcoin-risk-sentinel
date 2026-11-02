import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
const env={ALLOWED_ORIGIN:'https://tbenitz.github.io',DASHBOARD_ACCESS_TOKEN:'test-token-long-enough',DEEPSEEK_API_KEY:'private-test-api-key'};
const makeReq=(origin,token)=>new Request('https://worker.example/sentiment',{method:'POST',headers:{origin,'content-type':'application/json','x-dashboard-token':token},body:JSON.stringify({mode:'flash',price:100000,change24h:-1})});
test('rejects unauthorized access before contacting DeepSeek',async()=>{
  assert.equal((await worker.fetch(makeReq('https://evil.example',env.DASHBOARD_ACCESS_TOKEN),env)).status,403);
  assert.equal((await worker.fetch(makeReq('https://tbenitz.github.io','wrong-token'),env)).status,401);
});
test('runs Search then Flash and reports measured usage',async()=>{
  const previousFetch=globalThis.fetch;let calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push(String(url));
    if(String(url).endsWith('/v1/tools/search'))return Response.json({results:[{title:'ETF flows',url:'https://example.com/news',summary:'Reported inflows',date:'2026-11-02T00:00:00Z'}]});
    if(String(url).endsWith('/responses'))return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({score:56,confidence:'medium',label:'Mixed',summary:'Recent stories show mixed forces.',factors:['ETF flows up','Regulatory uncertainty']})}]}],usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100}}});
    throw new Error('unexpected '+url);
  };
  try{const resp=await worker.fetch(makeReq('https://tbenitz.github.io',env.DASHBOARD_ACCESS_TOKEN),env);const data=await resp.json();assert.equal(resp.status,200);assert.equal(data.sentiment.score,56);assert.equal(data.usage.input,1000);assert.equal(data.usage.searches,1);assert.equal(data.sources.length,1);assert.equal(calls.length,2);}
  finally{globalThis.fetch=previousFetch;}
});
test('AI sketch continuation validates points and returns provider token usage',async()=>{
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({continuation:[{t:0.6,pct:-3},{t:0.8,pct:-4},{t:1,pct:-2}]})}]}],usage:{input_tokens:450,output_tokens:120,input_tokens_details:{cached_tokens:0}}});
  try{
    const req=new Request('https://worker.example/scenario',{method:'POST',headers:{origin:'https://tbenitz.github.io','content-type':'application/json','x-dashboard-token':env.DASHBOARD_ACCESS_TOKEN},body:JSON.stringify({price:100000,horizon:24,sketch:[{t:0,pct:0},{t:0.4,pct:-1}],history:[100000,99500]})});
    const resp=await worker.fetch(req,env),data=await resp.json();assert.equal(resp.status,200);assert.equal(data.continuation.length,3);assert.equal(data.usage.input,450);assert.match(data.disclaimer,/not a BTC price forecast/);
  }finally{globalThis.fetch=previousFetch;}
});
