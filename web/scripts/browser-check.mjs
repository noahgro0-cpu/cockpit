import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
const url = process.env.CHECK_URL || 'http://127.0.0.1:4173/cockpit/';
const output = new URL('../../private/previews/', import.meta.url);
await mkdir(output, { recursive: true });
const mock = JSON.parse(await readFile(new URL('../../docs/mock-state.json', import.meta.url),'utf8'));
const errors=[];
try {
  for (const width of [375,834,1440]) {
    for(const theme of ['light','dark']) {
      const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(process.env.MOCK_URL || 'http://127.0.0.1:5174/cockpit/');
      await page.getByRole('heading',{name:'Analysis',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width} ${theme}`);
      await page.screenshot({path:new URL(`final-${width}-${theme}.png`,output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
      if(width<1100)for(const view of ['Kalender','To-dos','Mails','Einstellungen']) {
        await page.getByRole('navigation').getByRole('button',{name:view,exact:true}).click();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${view} ${width}`);
        if(view==='To-dos') {
          const edit=page.getByRole('button',{name:'Velo-Service buchen bearbeiten',exact:true});
          await edit.click();
          const sheet=page.getByRole('dialog',{name:'To-do bearbeiten'});
          await sheet.waitFor();
          assert.equal(await sheet.evaluate(el=>el.contains(document.activeElement)),true);
          assert.equal(await page.evaluate(()=>document.querySelectorAll('dialog[open]').length),1);
          await sheet.getByLabel('Titel',{exact:true}).fill('Unsaved edit');
          await page.keyboard.press('Escape');
          assert.equal(await sheet.count(),0);
          assert.equal(await edit.evaluate(el=>el===document.activeElement),true);
          await edit.click();
          assert.equal(await page.getByRole('dialog').getByLabel('Titel',{exact:true}).inputValue(),'Velo-Service buchen');
          await page.getByRole('dialog').getByRole('button',{name:'Schliessen'}).click();
        }
        if(view==='Kalender'&&width===834) {
          const box=await page.getByRole('navigation').boundingBox();
          assert(box.width<200&&box.y<200,'iPad uses a leading sidebar');
        }
      }
      await context.close();
    }
  }
  console.log('PASS: all views, 375/834/1440 px, light/dark, no horizontal overflow');
  console.log('PASS: iPad sidebar and modal editing, focus containment/return, Escape and cancelling unsaved edits');
  const context=await browser.newContext({viewport:{width:834,height:1000}});
  const page=await context.newPage();
  let state=structuredClone(mock);
  const writes=[];
  await page.route('https://script.google.com/**',async route=>{
    const body=route.request().postDataJSON();
    let data={time:state.generatedAt};
    if(body.action==='getState')data=state;
    if(body.action==='todo.add') {
      writes.push(body.payload);
      const existing=state.todos.find(t=>t.id===body.payload.id);
      data=existing||{...body.payload,status:'open',source:'manual',priority:0,dueHasTime:body.payload.dueHasTime??false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(!existing)state.todos.push(data);
    }
    await route.fulfill({json:{ok:true,data},headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.route('https://api.open-meteo.com/**',route=>route.abort());
  await page.route('https://transport.opendata.ch/**',route=>route.abort());
  await page.goto(url);
  const code=Buffer.from(JSON.stringify({u:'https://script.google.com/macros/s/browser-test/exec',k:'x'.repeat(32)})).toString('base64url');
  await page.getByLabel('Setup-Code').fill(code);
  await page.getByRole('button',{name:'Cockpit verbinden'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'To-dos',exact:true}).click();
  await page.getByText('Velo-Service buchen',{exact:true}).waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  const cdp=await context.newCDPSession(page);
  const installability=await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors,[]);
  console.log('PASS: production service worker controls page; no Chromium installability errors');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'To-dos',exact:true}).click();
  await page.getByText('Velo-Service buchen',{exact:true}).waitFor();
  await page.getByLabel('Schnellerfassung',{exact:true}).fill('Offline browser check');
  await page.getByRole('button',{name:'To-do hinzufügen'}).click();
  await page.getByText('Offline browser check',{exact:true}).waitFor();
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'To-dos',exact:true}).click();
  await page.getByText('Offline browser check',{exact:true}).waitFor();
  await context.setOffline(false);
  await page.getByRole('button',{name:'Aktualisieren',exact:true}).click();
  await page.waitForFunction(async()=>{const request=indexedDB.open('cockpit-local');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const count=await new Promise(resolve=>{const r=db.transaction('outbox').objectStore('outbox').count();r.onsuccess=()=>resolve(r.result);});db.close();return count===0;});
  assert.equal(writes.filter(w=>w.title==='Offline browser check').length,1);
  console.log('PASS: offline reload, durable optimistic change, single replay on reconnect');
  assert.deepEqual(errors,[]);
  await context.close();
} finally { await browser.close(); }
