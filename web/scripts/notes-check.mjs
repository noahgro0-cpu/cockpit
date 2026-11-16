// D28 check against the mock dev server (VITE_MOCK=1, port 5174): note pages with the rich editor,
// event editing and the to-do editor from the calendar. Screenshots go to private/previews/.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url = process.env.MOCK_URL || 'http://127.0.0.1:5174/cockpit/';
const out = new URL('../../private/previews/', import.meta.url);
await mkdir(out, { recursive: true });
const shot = (page, name) => page.screenshot({ path: new URL(name, out).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true });
const browser = await chromium.launch();
const errors = [];
try {
  for (const [width, theme] of [[834, 'light'], [375, 'dark'], [1440, 'light']]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, hasTouch: width < 1100 });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${width} console: ${m.text()}`));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (width >= 1100) await page.getByRole('tab', { name: 'Fächer' }).click();
    else await page.getByRole('navigation').getByRole('button', { name: 'Fächer', exact: true }).click();
    await page.getByRole('tab', { name: 'Physik' }).click();
    const editor = page.locator('.note-content');
    await editor.waitFor();
    // Stored HTML renders through the schema: heading, checklist, table, formula, highlight
    assert.equal(await editor.locator('h2', { hasText: 'Harmonischer Oszillator' }).count(), 1);
    assert.equal(await editor.locator('ul[data-type="taskList"] li').count(), 2);
    assert.equal(await editor.locator('table td').count(), 4);
    assert(await editor.locator('.katex').count() >= 1, 'formula rendered');
    assert.equal(await editor.locator('mark').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`);
    // Toolbar: all buttons reachable, at least 40 px
    const small = await page.locator('.note-toolbar .tool').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 40).length);
    assert.equal(small, 0);
    // Type, format, add a checklist and a table
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Neue Zeile ');
    await page.getByRole('button', { name: 'Fett', exact: true }).click();
    await page.keyboard.type('fett');
    await page.getByRole('button', { name: 'Fett', exact: true }).click();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Checkliste', exact: true }).click();
    await page.keyboard.type('Aufgabe abhaken');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Tabelle einfügen', exact: true }).click();
    await page.getByRole('button', { name: '+ Zeile', exact: true }).click();
    assert.equal(await editor.locator('table').count(), 2);
    assert.equal(await editor.locator('strong', { hasText: 'fett' }).count(), 1);
    // Formula sheet
    await page.keyboard.press('Control+End');
    await page.getByRole('button', { name: 'Formel einfügen', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Formel' });
    await sheet.getByLabel('Formel (LaTeX)').fill('U = R \\cdot I');
    assert(await sheet.locator('.math-preview .katex').count());
    await sheet.getByRole('button', { name: 'Übernehmen' }).click();
    assert(await editor.locator('.katex').count() >= 2);
    // Autosave: status, then reload keeps the text (mock outbox confirms locally)
    await editor.locator('xpath=..').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.getByRole('heading', { name: 'Physik' }).click();
    await page.waitForTimeout(1600);
    await shot(page, `notes-${width}-${theme}.png`);
    await page.reload();
    if (width >= 1100) await page.getByRole('tab', { name: 'Fächer' }).click();
    else await page.getByRole('navigation').getByRole('button', { name: 'Fächer', exact: true }).click();
    await page.getByRole('tab', { name: 'Physik' }).click();
    await page.locator('.note-content').getByText('Aufgabe abhaken', { exact: true }).waitFor({ timeout: 5000 });
    // New page
    await page.getByRole('button', { name: 'Neue Seite' }).click();
    await page.locator('.note-tabs button').nth(1).waitFor();
    assert.equal(await page.locator('.note-tabs button').count(), 2);
    assert.match(await page.locator('.note-title').inputValue(), /^Lektion \d+\.\d+\.$/);
    // Event sheet from the subject's appointments: an exam is editable
    await page.locator('.subject-event-list button', { hasText: 'Laborbericht Physik' }).click();
    const ev = page.getByRole('dialog', { name: 'Abgabe' });
    await ev.waitFor();
    await ev.getByLabel('Titel').fill('Laborbericht Physik (neu)');
    await ev.getByLabel('Art').selectOption('exam');
    await ev.getByRole('button', { name: 'Speichern' }).click();
    await page.locator('.subject-event-list', { hasText: 'Laborbericht Physik (neu)' }).waitFor();
    await page.locator('.subject-event-list button', { hasText: 'Laborbericht Physik (neu)' }).getByText(/Prüfung/).waitFor();
    await shot(page, `subject-${width}-${theme}.png`);
    await context.close();
  }
  // Calendar: a private appointment is fully editable (time, place), to-do editor reachable
  const context = await browser.newContext({ viewport: { width: 834, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Kalender', exact: true }).click();
  await page.locator('.calendar-day button.event', { hasText: 'Zahnarzt' }).click();
  const ev = page.getByRole('dialog', { name: 'Termin' });
  await ev.waitFor();
  await ev.getByLabel('Von').fill('15:00');
  await ev.getByLabel('Bis').fill('16:15');
  await ev.getByLabel('Ort').fill('Praxis');
  await ev.getByRole('button', { name: 'Speichern' }).click();
  await page.locator('.calendar-day button.event', { hasText: 'Zahnarzt' }).getByText('15:00').waitFor();
  await shot(page, 'calendar-edit-834.png');
  await page.locator('.calendar-day button.event', { hasText: 'Zahnarzt' }).click();
  await page.getByRole('dialog', { name: 'Termin' }).getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog', { name: 'Termin' }).getByRole('button', { name: 'Wirklich löschen' }).click();
  await page.locator('.calendar-day button.event', { hasText: 'Zahnarzt' }).waitFor({ state: 'detached' });
  // A lecture only takes the subject (for the whole series)
  await page.locator('.calendar-day button.event.lecture', { hasText: 'Physik' }).first().click();
  const lec = page.getByRole('dialog', { name: 'Lektion' });
  await lec.waitFor();
  assert.equal(await lec.getByLabel('Titel').count(), 0);
  await lec.getByLabel('Fach').selectOption('linalg');
  await lec.getByRole('button', { name: 'Speichern' }).click();
  await lec.waitFor({ state: 'detached' });
  await page.locator('.calendar-day .todo-chip').first().click();
  await page.getByRole('dialog', { name: 'To-do' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await page.getByRole('dialog', { name: 'To-do bearbeiten' }).getByLabel('Fach / Kategorie').waitFor();
  await context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: rich note pages (render, format, checklist, table, formula, autosave, new page), event and to-do editing');
} finally {
  await browser.close();
}
