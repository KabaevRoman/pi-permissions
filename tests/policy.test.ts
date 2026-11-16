import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {decide,shellWords} from '../lib/src/extensions/permissions.ts';
import install from '../lib/src/features/permissions.ts';import {harness} from './helper.ts';
const config:any={permissions:{allow:['Bash(npm test:*)'],ask:[],deny:[]},hooks:{}};
test('shell prefix grammar accepts simple arguments and rejects compound/expansion escapes',async()=>{
 assert.deepEqual(shellWords(`npm test 'literal value'`),['npm','test','literal value']);
 assert.equal((await decide('Bash',{command:'npm test -- --run'},'default',config,'/tmp')).action,'allow');
 for(const command of ['npm test; touch x','npm test && sh','npm test $(touch x)','npm test `id`','npm test > x','npm test\nsh','env npm test'])assert.equal((await decide('Bash',{command},'default',config,'/tmp')).action,'ask',command);
});
test('TaskRun shares Bash deny rules and plan mode rejects shell jobs',async()=>{
 const c:any={permissions:{allow:['TaskRun'],ask:[],deny:['Bash']}};
 assert.equal((await decide('TaskRun',{command:'echo hi'},'bypassPermissions',c,'/tmp')).action,'deny');
 assert.equal((await decide('TaskRun',{command:'echo hi'},'plan',config,'/tmp')).action,'deny');
});
test('native approvals bind session grants to exact inputs and current policy',async t=>{
 const h=await harness(install);t.after(()=>h.close());h.answers.push('Allow this exact call for session');
 const call={toolName:'bash',input:{command:'echo one'}};
 await h.emit('tool_call',call);assert.ok(h.entries.some(e=>e.customType==='cc:permission-grant'));
 h.ctx.hasUI=false;assert.equal((await h.emit('tool_call',call))[0],undefined);
 assert.equal((await h.emit('tool_call',{...call,input:{command:'echo two'}}))[0].block,true);
});
