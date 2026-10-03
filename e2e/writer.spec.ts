import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
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
  expect(url).toMatch(/#1\./);
  await page.reload();
  await expect(page.locator('#stitch-text')).toHaveValue('Home sweet home');
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await expect(p2.locator('#stitch-text')).toHaveValue('Home sweet home');
  await expect(p2.getByRole('radio', { name: 'Left' })).toBeChecked();
  await other.close();
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
