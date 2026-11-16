import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {decide,shellWords,withoutRedundantCd} from '@pi-ko/core/extensions/permissions';
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
test('selectable modes enforce safe defaults, per-call approval and full access',async()=>{
 const c:any={permissions:{allow:['Bash'],ask:['Write'],deny:['Edit']}};
 assert.equal((await decide('Read',{file_path:'/tmp/example'},'safe',c,'/tmp')).action,'allow');
 assert.equal((await decide('Write',{file_path:'/tmp/example'},'safe',config,'/tmp')).action,'ask');
 assert.equal((await decide('Bash',{command:'echo hi'},'ask',c,'/tmp')).action,'ask');
 assert.equal((await decide('Read',{},'ask',c,'/tmp')).action,'ask');
 assert.equal((await decide('Write',{},'fullAccess',c,'/tmp')).action,'allow');
 for(const mode of ['safe','ask','fullAccess'] as const)assert.equal((await decide('Edit',{},mode,c,'/tmp')).action,'deny');
});
test('mode picker persists selection and Ask Everything never reuses grants',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 h.answers.push('Ask Everything — approve every tool call');
 await h.commands.get('permissions').handler('',h.ctx);
 assert.equal(h.runtime.state.mode,'ask');
 assert.ok(h.entries.some(e=>e.customType==='code-compat:state'&&e.data.mode==='ask'));
 await h.emit('tool_call',{toolName:'read',input:{path:'example'}});
 h.ctx.hasUI=false;
 assert.equal((await h.emit('tool_call',{toolName:'read',input:{path:'example'}}))[0].block,true);
 h.ctx.hasUI=true;h.runtime.state.mode='plan';
 await assert.rejects(h.commands.get('permissions').handler('mode fullAccess',h.ctx),/ExitPlanMode/);
});
test('a redundant cd into the working directory matches rules like the bare command',async()=>{
 assert.equal(withoutRedundantCd('cd /tmp && npm test -- --run','/tmp'),'npm test -- --run');
 assert.equal(withoutRedundantCd('cd /tmp/../tmp && npm test','/tmp'),'npm test');
 assert.equal(withoutRedundantCd('cd /tmp/sub && npm test','/tmp'),undefined);
 assert.equal(withoutRedundantCd('cd "$PWD" && npm test','/tmp'),undefined);
 assert.equal((await decide('Bash',{command:'cd /tmp && npm test -- --run'},'default',config,'/tmp')).action,'allow');
 const denyConfig:any={permissions:{allow:[],ask:[],deny:['Bash(rm -rf:*)']},hooks:{}};
 assert.equal((await decide('Bash',{command:'cd /tmp && rm -rf x'},'default',denyConfig,'/tmp')).action,'deny');
 assert.equal((await decide('Bash',{command:'cd /tmp && npm test; touch x'},'default',config,'/tmp')).action,'ask');
});
test('session wildcards ignore a redundant cd prefix',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 h.answers.push('Allow Bash(echo:*) for session');
 const prefix=`cd '${h.ctx.cwd}' && `;
 await h.emit('tool_call',{toolName:'bash',input:{command:prefix+'echo hello world'}});
 assert.ok(h.entries.some(e=>e.customType==='cc:permission-rule'&&e.data.rule==='Bash(echo:*)'));
 h.ctx.hasUI=false;
 assert.equal((await h.emit('tool_call',{toolName:'bash',input:{command:prefix+'echo again'}}))[0],undefined);
 assert.equal((await h.emit('tool_call',{toolName:'bash',input:{command:'rm -rf x'}}))[0].block,true);
});
test('wildcard session rules approve matching prefixes without touching policy files',async t=>{
 const h=await harness(install);t.after(()=>h.close());
 h.answers.push('Allow Bash(echo:*) for session');
 await h.emit('tool_call',{toolName:'bash',input:{command:'echo hello world'}});
 assert.ok(h.entries.some(e=>e.customType==='cc:permission-rule'&&e.data.rule==='Bash(echo:*)'));
 h.ctx.hasUI=false;
 assert.equal((await h.emit('tool_call',{toolName:'bash',input:{command:'echo again'}}))[0],undefined);
 assert.equal((await h.emit('tool_call',{toolName:'bash',input:{command:'rm -rf x'}}))[0].block,true);
});
