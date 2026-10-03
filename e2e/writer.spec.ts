import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
});

test('the top bar links to the source code', async ({ page }) => {
  const link = page.getByRole('link', { name: 'Source code on GitHub' });
  await expect(link).toBeInViewport();
  await expect(link).toHaveAttribute('href', 'https://github.com/BenjaminDigeon/stitch-writer');
  await expect(link).toHaveAttribute('target', '_blank');
});

test('typing updates the chart and the stitch count', async ({ page }) => {
  await expect(page.getByText('Start typing to make your chart')).toBeVisible();
  await page.locator('#stitch-text').fill('Hello');
  await expect(page.locator('.status')).toContainText('stitches');
  const first = await page.locator('.status').innerText();
  await page.locator('#stitch-text').fill('Hello world');
  await expect(page.locator('.status')).not.toHaveText(first);
  await expect(page.locator('svg.chart')).toBeVisible();
});

test('a missing character is flagged', async ({ page }) => {
  await page.locator('#stitch-text').fill('Hi ✓');
  await expect(page.locator('#text-notice')).toContainText('not in');
});

test('the text and the settings survive a reload, and the share link opens the same chart', async ({
  page,
  browser,
}) => {
  await page.locator('#stitch-text').fill('Home sweet home');
  await page.getByRole('radio', { name: 'Left' }).check({ force: true });
  await page.waitForTimeout(800);
  const url = page.url();
  expect(url).toMatch(/#2\./);
  await page.reload();
  await expect(page.locator('#stitch-text')).toHaveValue('Home sweet home');
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await expect(p2.locator('#stitch-text')).toHaveValue('Home sweet home');
  await expect(p2.getByRole('radio', { name: 'Left' })).toBeChecked();
  await other.close();
});

test('each letter or each word can have its own color', async ({ page }) => {
  const threadPaths = page.locator('svg.chart path[class^="thread-"]');
  const rows = page.getByRole('list', { name: 'Text colors' }).getByRole('listitem');
  await page.locator('#stitch-text').fill('Emma');
  await expect(threadPaths).toHaveCount(1);

  await page.getByRole('button', { name: '+ Add a color' }).click();
  await expect(page.getByRole('radio', { name: 'Each letter' })).toBeChecked();
  await page.getByRole('button', { name: '+ Add a color' }).click();
  await expect(rows).toHaveCount(3);
  // E, m, m, a with 3 colors: the colors 1, 2, 3, then 1 again.
  await expect(threadPaths).toHaveCount(3);
  for (const row of await rows.all()) await expect(row.locator('.count')).not.toHaveText('0');

  await page.getByRole('radio', { name: 'Each word' }).check({ force: true });
  await expect(threadPaths).toHaveCount(1);
  await expect(rows.nth(1).locator('.count')).toHaveText('0');

  await page.getByRole('button', { name: 'Remove color 3' }).click();
  await expect(rows).toHaveCount(2);

  await page.waitForTimeout(800);
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Each word' })).toBeChecked();
});

test('a selection can get its own color, with undo and a shortcut', async ({ page }) => {
  const text = page.locator('#stitch-text');
  const threadPaths = page.locator('svg.chart path[class^="thread-"]');
  const bar = page.getByRole('toolbar', { name: 'Color of the selected text' });
  const select = (start: number, end: number) =>
    text.evaluate(
      (el: HTMLTextAreaElement, [s, e]) => {
        el.focus();
        el.setSelectionRange(s!, e!);
      },
      [start, end],
    );

  await text.fill('Emma Tom');
  await page.getByRole('button', { name: '+ Add a color' }).click();
  await page.getByRole('radio', { name: 'One color' }).check({ force: true });
  await expect(threadPaths).toHaveCount(1);

  await select(5, 8);
  await expect(bar).toContainText('“Tom”');
  await bar.getByRole('button', { name: /^Color 2/ }).click();
  await expect(threadPaths).toHaveCount(2);
  await expect(page.locator('.mirror mark.colored')).toHaveCount(2);
  await expect(bar.getByRole('button', { name: /^Color 2/ })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(threadPaths).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(threadPaths).toHaveCount(2);

  // Text typed just after the colored part takes its color.
  const rows = page.getByRole('list', { name: 'Text colors' }).getByRole('listitem');
  const before = Number(await rows.nth(1).locator('.count').innerText());
  await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(8, 8));
  await page.keyboard.type('my');
  await expect(text).toHaveValue('Emma Tommy');
  await expect
    .poll(async () => Number(await rows.nth(1).locator('.count').innerText()))
    .toBeGreaterThan(before);

  await select(0, 4);
  await page.keyboard.press('ControlOrMeta+Alt+Digit2');
  await expect(threadPaths).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Alt+Digit0');
  await expect(threadPaths).toHaveCount(2);
});

test('presets, reordering and the warning before a used color is removed', async ({ page }, info) => {
  const rows = page.getByRole('list', { name: 'Text colors' }).getByRole('listitem');
  const ids = () =>
    rows
      .locator('input[role="combobox"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).title.split(' ')[1]));
  const text = page.locator('#stitch-text');
  await text.fill('Emma Tom');

  await page.getByRole('button', { name: 'Rainbow' }).click();
  await expect(rows).toHaveCount(7);
  expect((await ids())[0]).toBe('666');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(1);

  await page.getByRole('button', { name: '+ Add a color' }).click();
  await page.getByRole('button', { name: '+ Add a color' }).click();
  expect(await ids()).toEqual(['3750', '3765', '3346']);

  // "Emma" gets color 1 by hand. The part keeps DMC 3750 when the color moves.
  await text.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 4);
  });
  await page.keyboard.press('ControlOrMeta+Alt+Digit1');
  await page.getByRole('button', { name: 'Move color 1', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  expect(await ids()).toEqual(['3765', '3750', '3346']);
  await expect(page.getByRole('button', { name: 'Move color 2', exact: true })).toBeFocused();
  await text.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 4);
  });
  await expect(
    page
      .getByRole('toolbar', { name: 'Color of the selected text' })
      .getByRole('button', { name: /^Color 2/ }),
  ).toHaveAttribute('aria-pressed', 'true');

  if (info.project.name !== 'mobile') {
    // Drag color 3 to the top.
    const handle = page.getByRole('button', { name: 'Move color 3', exact: true });
    const first = await rows.first().boundingBox();
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, first!.y + 2, { steps: 8 });
    await page.mouse.up();
    expect(await ids()).toEqual(['3346', '3765', '3750']);
  }

  // DMC 3750 is set by hand on "Emma": removing it asks first.
  const index = (await ids()).indexOf('3750');
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: `Remove color ${index + 1}`, exact: true }).click();
  expect(message).toContain('1 part of the text');
  await expect(rows).toHaveCount(3);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: `Remove color ${index + 1}`, exact: true }).click();
  await expect(rows).toHaveCount(2);
  expect(await ids()).not.toContain('3750');
});

test('the PDF export is a vector PDF with a cover and the chart pages', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'The download flow is the same on mobile.');
  await page.locator('#stitch-text').fill('Happy birthday :heart-01:');
  await expect(page.locator('svg.chart')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+p');
  await expect(page.getByRole('heading', { name: 'Export the chart' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const file = await (await download).path();
  const doc = await PDFDocument.load(await readFile(file!));
  const summary = await page.locator('.plan').innerText();
  const pages = Number(/(\d+) chart page/.exec(summary)![1]) + 1;
  expect(doc.getPageCount()).toBe(pages);
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    expect(dict?.get(PDFName.of('Subtype'))?.toString()).not.toBe('/Image');
  }
});

test('a heart can be inserted from the palette and deleted with one Backspace', async ({ page }) => {
  await page.locator('#stitch-text').fill('Love ');
  await page.getByRole('button', { name: /Insert/ }).click();
  await page.locator('.motif').first().click();
  await expect(page.locator('#stitch-text')).toHaveValue(/Love :[a-z]+-\d+:/);
  await page.locator('#stitch-text').press('End');
  await page.locator('#stitch-text').press('Backspace');
  await expect(page.locator('#stitch-text')).toHaveValue('Love ');
});
