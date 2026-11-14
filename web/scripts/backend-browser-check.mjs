import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Read credentials in memory only; never print them or capture personal state.
const contents=await readFile(new URL('../../backend/.env.local',import.meta.url),'utf8');
const env=Object.fromEntries(contents.split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/cockpit/');
 const result=await page.evaluate(async ({url,key})=>{const results=[];for(const action of ['ping','getState']){try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key,action,payload:{}}),redirect:'follow'});const body=await response.json();results.push({action,status:response.status,redirected:response.redirected,ok:body.ok===true,valid:action==='ping'?typeof body.data?.time==='string':body.data?.schema===1&&Array.isArray(body.data?.events)});}catch{results.push({action,ok:false});}}return results;},{url:env.WEB_APP_URL,key:env.API_KEY});
 assert(result.every(r=>r.ok&&r.valid&&r.status===200&&r.redirected));
 console.log('PASS: real browser CORS, redirect, ping and getState (read-only; no personal data logged)');
 const lifecycle=await page.evaluate(async ({url,key})=>{
   const call=async(action,payload)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key,action,payload}),redirect:'follow'});return r.json();};
   const id=crypto.randomUUID();
   try {
     const added=await call('todo.add',{id,title:'PWA integration check',due:'2026-11-20',dueHasTime:false});
     const replay=await call('todo.add',{id,title:'PWA integration check'});
     const updated=await call('todo.update',{id,patch:{title:'PWA integration check updated',due:'2026-11-21'}});
     const done=await call('todo.complete',{id,done:true});
     return {added:added.ok&&added.data.id===id,replay:replay.ok&&replay.data.id===id,updated:updated.ok&&updated.data.due==='2026-11-21',done:done.ok&&done.data.status==='done'};
   } finally {
     const deleted=await call('todo.delete',{id});
     if(!deleted.ok)throw Error('Test cleanup failed');
   }
 },{url:env.WEB_APP_URL,key:env.API_KEY});
 assert(Object.values(lifecycle).every(Boolean));
 console.log('PASS: real browser todo add, idempotent replay, update, complete, and cleanup delete');
}finally{await browser.close();}
