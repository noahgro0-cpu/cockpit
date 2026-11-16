// D28: list editing on an empty note page (mock dev server): Enter twice leaves a checklist,
// toggling a list on one line leaves the following lines alone.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 834, height: 1000 } });
await p.goto(process.env.MOCK_URL || 'http://127.0.0.1:5174/cockpit/');
await p.getByRole('navigation').getByRole('button', { name: 'Fächer', exact: true }).click();
await p.getByRole('tab', { name: 'Statistik' }).click();
await p.getByRole('button', { name: 'Erste Seite anlegen' }).click();
const ed = p.locator('.note-content');
await ed.click();
await p.getByRole('button', { name: 'Checkliste', exact: true }).click();
await p.keyboard.type('a');
await p.keyboard.press('Enter');
await p.keyboard.press('Enter');
await p.keyboard.type('after');
await p.keyboard.press('Enter');
await p.keyboard.type('x');
await p.keyboard.press('Enter');
await p.keyboard.type('y');
await p.keyboard.press('ArrowUp');
await p.getByRole('button', { name: 'Aufzählung', exact: true }).click();
const html = await ed.evaluate((e) => e.innerHTML.replace(/<label.*?<\/label>/g, ''));
assert.match(html, /^<ul data-type="taskList"><li data-checked="false"><div><p>a<\/p><\/div><\/li><\/ul><p>after<\/p><ul><li><p>x<\/p><\/li><\/ul><p>y<\/p>/, html);
console.log('PASS: checklist ends on double Enter, a list toggle stays on its line');
await b.close();
