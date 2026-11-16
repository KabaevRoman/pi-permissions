import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { acquire } from '@kabaevroman/pi-code-core';
import { decide } from '@kabaevroman/pi-code-core/extensions/permissions';
import { modes } from '@kabaevroman/pi-code-core/runtime/config';
import { atomicWrite, canonical, hash, optionalText } from '@kabaevroman/pi-code-core/runtime/utils';
import { resolve,join } from 'node:path';
export default function (pi: ExtensionAPI): void {
 const state=acquire(pi,'permissions');if(!state)return;const r=state.runtime;
 const grants=new Set<string>();
 pi.on('session_start',(_e,ctx)=>{grants.clear();for(const e of ctx.sessionManager.getBranch())if(e.type==='custom'&&e.customType==='cc:permission-grant'&&typeof (e.data as any)?.key==='string')grants.add((e.data as any).key);});
 pi.registerCommand('permissions',{description:'Inspect policy, set mode, or persist allow/ask/deny rules: /permissions mode acceptEdits; /permissions deny Bash(rm:*)',handler:async(args,ctx)=>{
  const [operation,...rest]=args.trim().split(/\s+/);const value=rest.join(' ');
  if(operation==='mode'){
   if(!modes.includes(value as any)||value==='plan')throw Error('Use default, acceptEdits, dontAsk or bypassPermissions; enter planning with EnterPlanMode');
   if(r.state.mode==='plan')throw Error('ExitPlanMode approval is required');r.state.mode=value as any;r.persist();
  }else if(['allow','ask','deny'].includes(operation)){
   if(!/^[A-Za-z][\w]*(?:\(.*\))?$/.test(value))throw Error('Invalid tool rule');
   if(!ctx.isProjectTrusted())throw Error('Trust project configuration before writing project policy');
   const file=join(ctx.cwd,'.claude/settings.local.json');const data=JSON.parse(await optionalText(file)??'{}');
   data.permissions??={};data.permissions[operation]=[...new Set([...(data.permissions[operation]??[]),value])];
   await atomicWrite(file,JSON.stringify(data,null,2)+'\n');r.message(`Saved ${operation} rule to ${file}`);
  }
  await r.reload(ctx);r.message(JSON.stringify({mode:r.state.mode,rules:r.config.permissions,sessionApprovals:grants.size}));
 }});
 pi.on('tool_call',async(e,ctx)=>{
  if(r.tools.has(e.toolName))return;
  if(!r.ready)return {block:true,reason:'Permission runtime unavailable'};
  await r.reload(ctx);
  const aliases:Record<string,string>={read:'Read',write:'Write',edit:'Edit',bash:'Bash',grep:'Grep',find:'Glob',ls:'Glob'};
  const input={...e.input} as any;if(input.path&&['read','write','edit'].includes(e.toolName))input.file_path=input.path;
  const fingerprint=JSON.stringify(r.config.permissions),inputHash=hash(JSON.stringify(e.input));
  const path=input.file_path??input.path;const target=typeof path==='string'?await canonical(resolve(ctx.cwd,path)):undefined;
  const decision=await decide(aliases[e.toolName]??e.toolName,input,r.state.mode,r.config,ctx.cwd,r.state.plan?.path);
  if(decision.action==='deny')return {block:true,reason:decision.reason};
  const key=hash(JSON.stringify([e.toolName,inputHash,target,fingerprint,r.state.mode]));
  if(decision.action==='ask'&&!grants.has(key)){
   if(!ctx.hasUI)return {block:true,reason:'Approval requires TUI/RPC UI'};
   const answer=await ctx.ui.select(`${e.toolName}: ${decision.reason}\n${JSON.stringify(input)}`,['Allow once','Allow this exact call for session','Deny'],{timeout:60000,signal:ctx.signal});
   if(!answer||answer==='Deny')return {block:true,reason:'Permission denied'};
   await r.reload(ctx);
   if(fingerprint!==JSON.stringify(r.config.permissions)||inputHash!==hash(JSON.stringify(e.input))||(typeof path==='string'&&target!==await canonical(resolve(ctx.cwd,path))))return {block:true,reason:'Policy or call target changed during approval; retry'};
   if(answer==='Allow this exact call for session'){grants.add(key);pi.appendEntry('cc:permission-grant',{key});}
  }
 });
}
