const test=require('node:test'),assert=require('node:assert/strict'),ds=require('../deepseek.js');
const key='sk-synthetic-unit-test-only',ok=(obj,status=200)=>({ok:status>=200&&status<300,status,json:async()=>obj});
const model=(data,usage={input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:100}})=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}],usage});
test('Flash mode sends a bearer key to search and responses and accounts for actual tokens',async()=>{
 const requests=[];const fetchImpl=async(url,options)=>{requests.push({url,options});return ok(url.endsWith('/search')?{results:[{title:'Article',url:'https://example.com/news',summary:'Some market information'}]}:model({score:41,confidence:'medium',label:'Cautious',summary:'Mixed recent headlines',factors:['Economic uncertainty']}))};
 const r=await ds.sentiment({key,price:90000,change24h:-2,fetchImpl});
 assert.deepEqual(requests.map(x=>x.url),['https://api.deepseek.com/v1/tools/search','https://api.deepseek.com/responses']);
 assert.ok(requests.every(x=>x.options.headers.authorization==='Bearer '+key));
 assert.equal(r.usage.input,1000);assert.equal(r.usage.output,200);assert.equal(r.usage.searches,1);assert.equal(r.sentiment.score,41);assert.equal(r.sources.length,1);
});
test('V4 Pro web search uses the official Responses tool and provider search stats',async()=>{
 let request;const fetchImpl=async(url,options)=>{request=JSON.parse(options.body);return ok(model({score:60,confidence:'low',summary:'Context',factors:[]},{input_tokens:160,output_tokens:70,server_tool_use:{tool_search:2,tool_fetch:1}}))};
 const r=await ds.sentiment({key,mode:'pro',price:83000,fetchImpl});assert.equal(request.model,'deepseek-v4-pro');assert.deepEqual(request.tools,[{type:'web_search'}]);assert.equal(r.usage.searches,2);assert.equal(r.usage.fetches,1);
});
test('Scenario continuation validates the model extension',async()=>{
 const r=await ds.scenario({key,price:80000,horizon:24,sketch:[{t:0,pct:0},{t:.4,pct:2}],history:[81000],fetchImpl:async()=>ok(model({continuation:[{t:.7,pct:1},{t:1,pct:-1}]}))});assert.equal(r.continuation.length,2);assert.equal(r.continuation[1].t,1)
});
test('CORS and network denial have transparent error messages',async()=>{
 await assert.rejects(ds.sentiment({key,price:80000,fetchImpl:async()=>{throw new TypeError('Failed to fetch')}}),/CORS/);
});
test('No API key blocks requests',async()=>{
 await assert.rejects(ds.sentiment({key:'',price:80000,fetchImpl:async()=>{throw Error('should not reach network')}}),/DeepSeek API key/);
});
test('Untrusted non-web URL is excluded from source links',async()=>{
 const fetchImpl=async(url)=>ok(url.endsWith('/search')?{results:[{url:'javascript:alert(1)',title:'unsafe'},{url:'https://example.com/bitcoin',title:'safe'}]}:model({score:50,confidence:'low',summary:'No conclusion',factors:[]}));const r=await ds.sentiment({key,price:80000,fetchImpl});assert.equal(r.sources.length,1);assert.equal(r.sources[0].title,'safe');
});
