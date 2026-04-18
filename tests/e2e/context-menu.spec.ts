import { expect, test } from '@playwright/test'
import { seedStudioWorkspace } from './utils/studioFixtures'

test('shows custom menu on import shell and closes on shift-right-click', async ({ page }) => {
  await page.goto('/')

  const shell = page.locator('[data-context-kind="import-shell"]').last()
  await shell.click({ button: 'right' })
  await expect(page.getByTestId('app-context-menu')).toBeVisible()
  await expect(page.locator('[data-context-menu-command="selectArchive"]')).toBeVisible()

  await shell.click({ button: 'right', modifiers: ['Shift'] })
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)
})

test('supports workspace and editable context menus after seeded load', async ({ page }) => {
  await seedStudioWorkspace(page)

  const pktRow = page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'sample.pkt' })
  await pktRow.click({ button: 'right' })
  await expect(pktRow).toHaveClass(/bg-blue-600/)
  await expect(page.locator('[data-context-menu-command="rawExport"]')).toBeVisible()
  await expect(page.locator('[data-context-menu-command="renameFile"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)

  const shpRow = page.locator('[data-context-kind="file-tree-row"]').filter({ hasText: 'unit.shp' })
  await shpRow.click({ button: 'right' })
  await expect(page.locator('[data-context-menu-command="imageGifExport"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)

  const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="搜索素材"]')
  await searchInput.fill('sample')
  await searchInput.click({ button: 'right' })
  await expect(page.locator('[data-context-menu-command="selectAll"]')).toBeVisible()
  await page.locator('[data-context-menu-command="selectAll"]').click()
  await page.keyboard.press('Backspace')
  await expect(searchInput).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)

  await searchInput.click({ button: 'right', modifiers: ['Shift'] })
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)

  await pktRow.click()

  const editorSurface = page.locator('.vscode-editor-shell').first()
  await expect(editorSurface).toBeVisible()
  await editorSurface.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await editorSurface.click({ button: 'right' })
  const copyCommand = page.locator('[data-context-menu-command="copy"]')
  await expect(copyCommand).toBeVisible()
  await expect(copyCommand).toBeEnabled()
  await expect(page.getByText('Command Palette')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)

  await editorSurface.click({ button: 'right', modifiers: ['Shift'] })
  await expect(page.getByTestId('app-context-menu')).toHaveCount(0)
})

test('keeps the menu inside the viewport near the bottom edge', async ({ page }) => {
  await seedStudioWorkspace(page)

  await page.mouse.click(1400, 930, { button: 'right' })
  const menu = page.getByTestId('app-context-menu')
  await expect(menu).toBeVisible()

  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  expect(box.x + box.width).toBeLessThanOrEqual(1440)
  expect(box.y + box.height).toBeLessThanOrEqual(960)
})
