import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { acquire } from '@kabaevroman/pi-code-core';
import { decide, shellWords, withoutRedundantCd } from '@kabaevroman/pi-code-core/extensions/permissions';
import { modes } from '@kabaevroman/pi-code-core/runtime/config';
import { atomicWrite, canonical, hash, optionalText, humanReadable } from '@kabaevroman/pi-code-core/runtime/utils';
import { resolve, join, dirname } from 'node:path';
export default function (pi: ExtensionAPI): void {
 const state=acquire(pi,'permissions');if(!state)return;const r=state.runtime;
 const grants=new Set<string>(),sessionRules=new Set<string>();
 const choices = ['Safe — allow workspace reads and workflow operations', 'Ask Everything — approve every tool call', 'Full Access — allow all operations except explicit deny rules'];
 const selectableModes = ['safe', 'ask', 'fullAccess'] as const;
 // Session-scoped wildcard rules (Codex-style) merge into allow rules without touching policy files.
 const wildcards=(aliased:string,input:any,target?:string,cwd=''):string[]=>{
  const out:string[]=[];
  if(aliased==='Bash'&&typeof input.command==='string'){
   const words=shellWords(withoutRedundantCd(input.command,cwd)??input.command);
   if(words?.length){if(words.length>1)out.push(`Bash(${words.slice(0,2).join(' ')}:*)`);out.push(`Bash(${words[0]}:*)`);}
  }else if(['Read','Write','Edit','NotebookEdit'].includes(aliased)&&target)out.push(`${aliased}(${dirname(target)}/**)`);
  else if(['Grep','Glob'].includes(aliased)&&target)out.push(`${aliased}(${target}/**)`);
  return [...new Set(out)];
 };
 const truncate=(value:any)=>typeof value==='string'&&value.length>600?value.slice(0,600)+`… (${value.length-600} more chars)`:value;
 const formatDetail=(input:any):string=>{
  if(typeof input?.code==='string'){
   const lines=(input.code as string).split('\n');
   const reached=[...new Set([...(input.code as string).matchAll(/\btools\.([A-Za-z]\w*)/g)].map(match=>match[1]))];
   return `code:\n${lines.slice(0,15).map(line=>`  ${line}`).join('\n')}${lines.length>15?`\n  … (${lines.length-15} more lines)`:''}${reached.length?`\nreaches tools: ${reached.join(', ')}`:''}`;
  }
  if(typeof input?.command==='string')return `command:\n  ${truncate(input.command)}`;
  const path=input.file_path??input.path;
  const rest=Object.fromEntries(Object.entries(input).filter(([key])=>!['file_path','path'].includes(key)).map(([key,value])=>[key,truncate(value)]));
  return `${typeof path==='string'?`path: ${path}\n`:''}${Object.keys(rest).length?humanReadable(rest):''}`.trim();
 };
 pi.on('session_start',(_e,ctx)=>{grants.clear();sessionRules.clear();for(const e of ctx.sessionManager.getBranch())if(e.type==='custom'){if(e.customType==='cc:permission-grant'&&typeof (e.data as any)?.key==='string')grants.add((e.data as any).key);if(e.customType==='cc:permission-rule'&&typeof (e.data as any)?.rule==='string')sessionRules.add((e.data as any).rule);}});
 pi.registerCommand('permissions',{description:'Select Safe, Ask Everything, or Full Access; /permissions mode safe|ask|fullAccess; /permissions allow|ask|deny Tool',handler:async(args,ctx)=>{
  let [operation,...rest]=args.trim().split(/\s+/);let value=rest.join(' ');
  if(!operation || (operation==='mode' && !value)) {
   if(r.state.mode==='plan')throw Error('ExitPlanMode approval is required');
   if(!ctx.hasUI)throw Error('Use /permissions mode safe, ask or fullAccess');
   const selected=await ctx.ui.select('Permission mode',choices);
   if(!selected)return;
   operation='mode';value=selectableModes[choices.indexOf(selected)];
  }
  if(operation==='mode'){
   if(!modes.includes(value as any)||value==='plan')throw Error('Use safe, ask or fullAccess (legacy modes: default, acceptEdits, dontAsk, bypassPermissions); enter planning with EnterPlanMode');
   if(r.state.mode==='plan')throw Error('ExitPlanMode approval is required');r.state.mode=value as any;grants.clear();r.persist();r.status(ctx);
  }else if(['allow','ask','deny'].includes(operation)){
   if(!/^[A-Za-z][\w]*(?:\(.*\))?$/.test(value))throw Error('Invalid tool rule');
   if(!ctx.isProjectTrusted())throw Error('Trust project configuration before writing project policy');
   const file=join(ctx.cwd,'.claude/settings.local.json');const data=JSON.parse(await optionalText(file)??'{}');
   data.permissions??={};data.permissions[operation]=[...new Set([...(data.permissions[operation]??[]),value])];
   await atomicWrite(file,JSON.stringify(data,null,2)+'\n');r.message(`Saved ${operation} rule to ${file}`);
  }
  await r.reload(ctx);r.message(humanReadable({mode:r.state.mode,rules:r.config.permissions,sessionApprovals:grants.size,sessionRules:[...sessionRules]}));
 }});
 pi.on('tool_call',async(e,ctx)=>{
  if(r.tools.has(e.toolName))return;
  if(!r.ready)return {block:true,reason:'Permission runtime unavailable'};
  await r.reload(ctx);
  const aliases:Record<string,string>={read:'Read',write:'Write',edit:'Edit',bash:'Bash',grep:'Grep',find:'Glob',ls:'Glob'};
  const input={...e.input} as any;if(input.path&&['read','write','edit'].includes(e.toolName))input.file_path=input.path;
  const aliased=aliases[e.toolName]??e.toolName;
  const effective={...r.config,permissions:{...r.config.permissions,allow:[...r.config.permissions.allow,...sessionRules]}};
  const decision=await decide(aliased,input,r.state.mode,effective,ctx.cwd,r.state.plan?.path);
  if(decision.action==='deny')return {block:true,reason:decision.reason};
  const fingerprint=JSON.stringify(r.config.permissions),inputHash=hash(JSON.stringify(e.input));
  const path=input.file_path??input.path;const target=typeof path==='string'?await canonical(resolve(ctx.cwd,path)):undefined;
  const key=hash(JSON.stringify([e.toolName,inputHash,target,fingerprint,r.state.mode]));
  if(decision.action==='ask'&&(r.state.mode==='ask'||!grants.has(key))){
   if(!ctx.hasUI)return {block:true,reason:'Approval requires TUI/RPC UI'};
   const sessionOptions=r.state.mode==='ask'?[]:['Allow this exact call for session',...wildcards(aliased,input,target,ctx.cwd).map(rule=>`Allow ${rule} for session`)];
   const answer=await ctx.ui.select(`${e.toolName}: ${decision.reason}\n${formatDetail(input)}`,['Allow once',...sessionOptions,'Deny'],{signal:ctx.signal});
   if(!answer||answer==='Deny')return {block:true,reason:'Permission denied'};
   await r.reload(ctx);
   if(key!==hash(JSON.stringify([e.toolName,inputHash,target,fingerprint,r.state.mode]))||fingerprint!==JSON.stringify(r.config.permissions)||inputHash!==hash(JSON.stringify(e.input))||(typeof path==='string'&&target!==await canonical(resolve(ctx.cwd,path))))return {block:true,reason:'Policy or call target changed during approval; retry'};
   if(answer==='Allow this exact call for session'){grants.add(key);pi.appendEntry('cc:permission-grant',{key});}
   else if(answer.startsWith('Allow ')&&answer.endsWith(' for session')){const rule=answer.slice(6,-12);if(/^[A-Za-z][\w]*\(.*\)$/.test(rule)){sessionRules.add(rule);pi.appendEntry('cc:permission-rule',{rule});}}
  }
 });
}
