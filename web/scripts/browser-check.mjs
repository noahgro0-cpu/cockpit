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
      await page.locator(width>=1100?'.next-strip':'.hero').waitFor();
      // D24: lectures never appear as next appointment
      assert.equal(await page.locator(width>=1100?'.next-strip':'.hero').getByText('Analysis',{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width} ${theme}`);
      if(width>=1100) {
        // D26: Kalender | Mails | To-dos, next-appointment bar and docked capture on top
        const columns=await page.locator('.board-main > *').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().x));
        assert(columns[0]<columns[1]&&columns[1]<columns[2]);
        assert(await page.locator('.board-main > :first-child').getByRole('heading',{name:'Nächste 7 Tage'}).count());
        assert(await page.locator('.board-main > :last-child').getByRole('heading',{name:'To-dos'}).count());
        assert(await page.locator('.board-top .quick-capture.docked #quick').count());
        const fold=await page.evaluate(()=>[...document.querySelectorAll('.board-main .section-title')].every(el=>el.getBoundingClientRect().bottom<innerHeight));
        assert(fold,'all three column headings above the fold');
      }
      if(width<1100) await page.getByRole('navigation').getByRole('button',{name:'Kalender',exact:true}).click();
      assert.equal(await page.locator('.calendar .calendar-day').count(),7);
      assert.equal(await page.locator('.calendar .calendar-day').first().getAttribute('aria-label'),'Montag, 16. November');
      await page.getByRole('button',{name:'Monat',exact:true}).click();
      const month=page.getByRole('dialog',{name:'Monatsansicht'});
      await month.waitFor();
      assert.equal(await month.evaluate(el=>el.contains(document.activeElement)),true);
      assert.equal(await month.getByRole('button',{name:'Vorheriger Monat'}).isDisabled(),true);
      await month.getByRole('button',{name:'Nächster Monat'}).click();
      await month.getByRole('heading',{name:'Dezember 2026'}).waitFor();
      assert.equal(await month.getByRole('button',{name:'Nächster Monat'}).isDisabled(),true);
      assert.equal(await month.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      await page.screenshot({path:new URL('month-'+width+'-'+theme+'.png',output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
      await page.keyboard.press('Escape');
      assert.equal(await month.count(),0);
      assert.equal(await page.getByRole('button',{name:'Monat',exact:true}).evaluate(el=>el===document.activeElement),true);
      if(width<1100) await page.getByRole('navigation').getByRole('button',{name:'Heute',exact:true}).click();
      await page.screenshot({path:new URL(`final-${width}-${theme}.png`,output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
      if(width<1100)for(const view of ['Kalender','To-dos','Mails','Fächer']) {
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
        if(view==='Fächer') {
          // D27: subject tabs, info/links, to-dos, events and notes
          await page.locator('.subject-panel .note-content, .subject-panel .note-empty').first().waitFor();
          assert(await page.getByRole('tab',{name:'Physik'}).count());
          assert.equal(await page.locator('.quick-capture:not(.docked)').count(),0,'no floating capture over the notes');
        }
        if(view==='Kalender'&&width===834) {
          const box=await page.getByRole('navigation').boundingBox();
          assert(box.width<200&&box.y<200,'iPad uses a leading sidebar');
        }
      }
      // D27: settings via the header gear; on the dashboard the page switch Cockpit | Fächer
      await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
      await page.getByRole('heading',{name:'Synchronisierung'}).waitFor();
      await page.getByRole('button',{name:'Zurück zur Übersicht'}).click();
      if(width>=1100) {
        await page.getByRole('tab',{name:'Fächer'}).click();
        await page.locator('.subject-panel .note-content, .subject-panel .note-empty').first().waitFor();
        const side=await page.locator('.subject-tabs').boundingBox();
        assert(side.width<=240,'PC: subject list as a sidebar');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow Fächer 1440');
        await page.screenshot({path:new URL(`faecher-${width}-${theme}.png`,output).pathname.replace(/^\/([A-Z]:)/,'$1')});
        await page.getByRole('tab',{name:'Cockpit'}).click();
        await page.locator('.next-strip').waitFor();
      }
      await context.close();
    }
  }
  console.log('PASS: all views, 375/834/1440 px, light/dark, no horizontal overflow');
  console.log('PASS: seven days, calendar left (D26), bounded month navigation and modal focus');
  console.log('PASS: iPad sidebar and modal editing, focus containment/return, Escape and cancelling unsaved edits');
  const context=await browser.newContext({viewport:{width:834,height:1000}});
  const page=await context.newPage();
  let state=structuredClone(mock);
  const writes=[];
  let offline=false;
  await page.route('https://script.google.com/**',async route=>{
    if(offline) return route.abort('internetdisconnected');
    const body=route.request().postDataJSON();
    let data={time:state.generatedAt};
    if(body.action==='getState')data=state;
    if(body.action==='capture') {
      writes.push(body.payload);
      const todo={id:body.payload.id,title:'Buch kaufen',status:'open',source:'quick',priority:0,dueHasTime:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      const event={id:body.payload.id+'-event',calendar:'private',kind:'private',title:'Meeting',start:state.generatedAt,end:state.generatedAt,allDay:false};
      state.todos.push(todo); state.events.push(event);
      data={type:'todo',todo,items:[{type:'todo',todo},{type:'event',event}],message:'To-do erfasst: Buch kaufen\nTermin eingetragen: Meeting'};
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
  offline=true;
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'To-dos',exact:true}).click();
  await page.getByText('Velo-Service buchen',{exact:true}).waitFor();
  await page.getByLabel('Schnellerfassung',{exact:true}).fill('Offline browser check');
  await page.getByRole('button',{name:'Eingabe speichern'}).click();
  await page.getByText(/Synchronisierung ausstehend/).waitFor({timeout:5000});
  assert.equal(await page.getByText('Offline browser check',{exact:true}).count(),0);
  await page.reload();
  await page.getByRole('navigation').getByRole('button',{name:'To-dos',exact:true}).click();
  await page.getByText(/Synchronisierung ausstehend/).waitFor({timeout:5000});
  assert.equal(await page.getByText('Offline browser check',{exact:true}).count(),0);
  offline=false;
  await context.setOffline(false);
  await page.getByRole('button',{name:'Aktualisieren',exact:true}).click();
  await page.waitForFunction(async()=>{const request=indexedDB.open('cockpit-local');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const count=await new Promise(resolve=>{const r=db.transaction('outbox').objectStore('outbox').count();r.onsuccess=()=>resolve(r.result);});db.close();return count===0;});
  await page.getByText('Buch kaufen',{exact:true}).waitFor();
  assert.equal(writes.filter(w=>w.text==='Offline browser check').length,1);
  assert.match(writes[0].id,/^[0-9a-f-]{36}$/);
  await page.getByText('To-do erfasst: Buch kaufen\nTermin eingetragen: Meeting',{exact:true}).waitFor();
  await page.getByText('Buch kaufen',{exact:true}).waitFor();
  console.log('PASS: offline reload, durable capture without optimistic entries, single replay on reconnect');
  assert.deepEqual(errors,[]);
  await context.close();
} finally { await browser.close(); }
