import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../api/spin.js', import.meta.url), 'utf8'))
  .replace("import { randomInt, randomBytes } from 'node:crypto';", "import { randomBytes } from 'node:crypto'; const randomInt = () => globalThis.spinFixture.segment;")
  .replace("import { createClient } from '@supabase/supabase-js';", '')
  .replace("const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);", 'const supabase = { from: table => globalThis.spinFixture.query(table) };')
  .replace("'../lib/spin-rewards.js'", JSON.stringify(new URL('../lib/spin-rewards.js', import.meta.url).href));
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(segment, existing = null) {
  const saved = [];
  const context = { segment, saved, query(table) {
    let payload;
    const q = new Proxy({}, {get(_, name) {
      if (name === 'insert') return value => {payload = value; saved.push(value); return q;};
      if (name === 'then') return (resolve, reject) => Promise.resolve({data: table === 'outlets' ? {id:'outlet',name:'Demo',slug:'demo',status:'ACTIVE'} : table === 'outlet_spin_settings' ? {enabled:true,minimum_order:299,prizes:[{type:'PERCENT',value:5},{type:'FLAT',value:25},{type:'FREE_ITEM',menuItemId:'12345678-1234-1234-1234-123456789abc',category:'COLD_DRINK',label:'Free cola'},{type:'PERCENT',value:15}]} : payload || existing, error:null}).then(resolve,reject);
      return () => q;
    }}); return q;
  }};
  globalThis.spinFixture = context; return context;
}
async function spin() { let result; const res = {status(code){this.code=code;return this;},json(body){result={code:this.code,body};},setHeader(){}}; await handler({method:'POST',body:{outlet:'demo',deviceKey:'test-browser'}},res);return result; }
test('API returns the exact winning slice for every outcome and snapshots gifts', async () => {
  for (let segment=0; segment<6; segment++) {
    const f=fixture(segment), result=await spin();
    assert.equal(result.code,201);
    assert.equal(result.body.segment,segment);
    const prize=result.body.slots[segment];
    if (prize.type==='NONE') {assert.equal(result.body.outcome,'NO_REWARD');assert.equal(result.body.reward,undefined);}
    else {assert.equal(result.body.reward.label,prize.label);assert.equal(result.body.reward.type,prize.type);}
    if (prize.type==='FREE_ITEM') assert.equal(f.saved[0].reward_details.menuItemId,prize.menuItemId);
  }
});
test('repeat spins return the original result without another draw or new reward', async () => {
  for (const label of ['15% OFF','Better luck next time']) {
    const f=fixture(0,{code:'ORIGINAL',label,reward_type:'PERCENT',reward_value:15,status:'ISSUED'});
    const result=await spin();assert.equal(result.code,409);assert.equal(result.body.reused,true);assert.equal(result.body.segment,undefined);assert.equal(f.saved.length,0);
    assert.equal(result.body.outcome,label==='15% OFF'?'REWARD':'NO_REWARD');
  }
});
