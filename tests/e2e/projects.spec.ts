import { expect, test } from '@playwright/test'
import { seedStudioWorkspace } from './utils/studioFixtures'

test('can create a project, add base files, and search across base and project scopes', async ({ page }) => {
  await seedStudioWorkspace(page)

  page.once('dialog', (dialog) => dialog.accept('Demo Project'))
  await page.getByRole('button', { name: /项目管理|Projects/ }).click()
  await page.getByRole('button', { name: /创建项目|Create Project/ }).click()

  await expect(page.getByText(/当前项目：Demo Project|Current project: Demo Project/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Demo Project/ })).toBeVisible()
  await page.getByRole('button', { name: /Demo Project/ }).click()
  await expect(page.getByRole('button', { name: /创建项目|Create Project/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /设置|Settings/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /导出项目 ZIP|Export Project ZIP/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /基座文件|Base Files/ }).click()
  const basePktRow = page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'sample.pkt' })
  await basePktRow.click({ button: 'right' })
  await page.locator('[data-context-menu-command="addToProject"]').click()

  await expect(page.getByText(/当前项目：Demo Project|Current project: Demo Project/)).toBeVisible()
  await expect(page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'sample.pkt' })).toBeVisible()

  const pktRow = page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'sample.pkt' })
  await pktRow.click({ button: 'right' })
  await expect(page.locator('[data-context-menu-command="renameFile"]')).toBeVisible()
  await page.keyboard.press('Escape')

  const searchInput = page.getByTestId('global-search-input')
  await searchInput.click()
  await searchInput.fill('inside')

  await expect(page.getByTestId('global-search-overlay')).toBeVisible()
  await expect(page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'sample.pkt' })).toBeVisible()
  await expect(page.getByText(/基座|Base/).first()).toBeVisible()
  await expect(page.getByText(/Demo Project/).first()).toBeVisible()
})
