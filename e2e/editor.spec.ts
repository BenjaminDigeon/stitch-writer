import { expect, test } from '@playwright/test';

test('a font made in the editor is available in the writer', async ({ page, context }, info) => {
  test.skip(info.project.name === 'mobile', 'The editor is a desktop tool.');
  await page.goto('./editor.html');
  await page.getByRole('button', { name: 'New font' }).first().click();
  await page.getByLabel('New glyph').fill('o');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const box = (await page.locator('svg.canvas').boundingBox())!;
  await page.mouse.click(box.x + 26 * 2.5, box.y + 26 * 8.5);
  await page.mouse.click(box.x + 26 * 3.5, box.y + 26 * 8.5);
  await expect(page.getByText('Saved in this browser')).toBeVisible();

  const writer = await context.newPage();
  await writer.goto('./');
  await writer.locator('.current').click();
  await writer.locator('.card', { hasText: 'My font' }).click();
  await writer.locator('#stitch-text').fill('oo');
  await expect(writer.locator('.status')).toContainText('stitches');
  await expect(writer.locator('#text-notice')).not.toContainText('not in');
});
