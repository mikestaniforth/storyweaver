import { expect, test } from '@playwright/test';

test('two independent sessions join, start, alternate, and preserve the story', async ({
  browser,
}) => {
  const parentContext = await browser.newContext();
  const childContext = await browser.newContext();
  const parent = await parentContext.newPage();
  const child = await childContext.newPage();

  await parent.goto('/');
  await parent.getByRole('button', { name: /I’m the parent/i }).click();
  await expect(parent.getByRole('heading', { name: /Good evening/i })).toBeVisible();
  await parent.getByRole('button', { name: /The Lanterns of Everwood/i }).click();
  await expect(parent.getByText('At the story gate')).toBeVisible();
  await expect(parent.locator('.game-shell')).toHaveClass(/time-dusk/);
  await parent.getByRole('button', { name: /Enable music/i }).click();
  await expect(parent.locator('.soundtrack-control')).toHaveClass(/is-playing/);
  await parent.getByText('Mood & boundaries').click();
  await parent.getByLabel('Fear').selectOption('3');
  await parent.getByRole('button', { name: 'Save story tone' }).click();
  await expect(parent.getByLabel('Fear')).toHaveValue('3');

  await child.goto('/');
  await child.getByRole('button', { name: /I’m the young adventurer/i }).click();
  await child.getByRole('button', { name: /Enter the adventure/i }).click();
  await expect(child.getByRole('heading', { name: /Good evening/i })).toBeVisible();
  await child.getByRole('button', { name: /The Lanterns of Everwood/i }).click();

  await expect(parent.locator('.together-status')).toHaveText(/Together/, { timeout: 20_000 });
  await parent.getByRole('button', { name: /Begin chapter/i }).click();
  await expect(parent.getByText(/Your turn, Dad/i)).toBeVisible();

  await parent
    .getByLabel('Your action')
    .fill('Carefully inspect the silver tracks with my moonlit compass');
  await parent.getByRole('button', { name: 'Send action' }).click();

  await expect(parent.getByText(/Rowan has the spotlight/i)).toBeVisible();
  await expect(child.getByText(/Your turn, Rowan/i)).toBeVisible({ timeout: 20_000 });
  await expect(
    child.getByText('Carefully inspect the silver tracks with my moonlit compass', { exact: true }),
  ).toBeVisible();

  await child.reload();
  await expect(child.getByText(/Your turn, Rowan/i)).toBeVisible({ timeout: 20_000 });

  await parentContext.close();
  await childContext.close();
});

test('three independent sessions join one campaign and rotate every turn', async ({ browser }) => {
  const parentContext = await browser.newContext();
  const firstChildContext = await browser.newContext();
  const secondChildContext = await browser.newContext();
  const parent = await parentContext.newPage();
  const firstChild = await firstChildContext.newPage();
  const secondChild = await secondChildContext.newPage();
  const title = 'The Three Star Keys';

  await parent.goto('/');
  await parent.getByRole('button', { name: /I’m the parent/i }).click();
  await parent.getByRole('button', { name: /New adventure/i }).click();
  await parent.getByLabel('Campaign title').fill(title);
  await parent
    .getByLabel('Your starting idea')
    .fill('Three star keys have fallen into a maze whose rooms move whenever someone laughs.');
  await expect(parent.locator('.party-picker input[name="playerIds"]:checked')).toHaveCount(2);
  await parent.getByRole('button', { name: /Create our world/i }).click();
  await expect(parent.getByText('At the story gate')).toBeVisible({ timeout: 20_000 });

  await firstChild.goto('/');
  await firstChild.getByRole('button', { name: /I’m the young adventurer/i }).click();
  await firstChild.getByLabel('Your adventure name').fill('Rowan');
  await firstChild.getByRole('button', { name: /Enter the adventure/i }).click();
  await firstChild.getByRole('button', { name: new RegExp(title, 'i') }).click();

  await secondChild.goto('/');
  await secondChild.getByRole('button', { name: /I’m the young adventurer/i }).click();
  await secondChild.getByLabel('Your adventure name').fill('Wren');
  await secondChild.getByRole('button', { name: /Enter the adventure/i }).click();
  await secondChild.getByRole('button', { name: new RegExp(title, 'i') }).click();

  await expect(parent.locator('.together-status')).toHaveText(/Together/, { timeout: 20_000 });
  await parent.getByRole('button', { name: /Begin chapter/i }).click();
  await parent.getByLabel('Your action').fill('Look around for the first star key');
  await parent.getByRole('button', { name: 'Send action' }).click();
  await expect(firstChild.getByText(/Your turn, Rowan/i)).toBeVisible({ timeout: 20_000 });

  await firstChild.getByLabel('Your action').fill('Look for a pattern in the moving walls');
  await firstChild.getByRole('button', { name: 'Send action' }).click();
  await expect(secondChild.getByText(/Your turn, Wren/i)).toBeVisible({ timeout: 20_000 });

  await secondChild.getByLabel('Your action').fill('Listen for the sound of the third key');
  await secondChild.getByRole('button', { name: 'Send action' }).click();
  await expect(parent.getByText(/Your turn, Dad/i)).toBeVisible({ timeout: 20_000 });

  await parentContext.close();
  await firstChildContext.close();
  await secondChildContext.close();
});
