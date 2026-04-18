import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const archivePath = process.env.RA2WEB_STUDIO_IMPORT_ARCHIVE ?? '/Users/bxy/Downloads/fully-music.exe'

test('imports a real archive and keeps context menu available @smoke-import', async ({ page }) => {
  test.slow()

  if (!existsSync(archivePath)) {
    throw new Error(
      `Missing smoke import archive: ${archivePath}. Set RA2WEB_STUDIO_IMPORT_ARCHIVE or place fully-music.exe in /Users/bxy/Downloads/.`,
    )
  }

  await page.goto('/')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Select archive|选择归档/ }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(archivePath)

  await expect(page.locator('[data-context-kind="global-shell"]')).toBeVisible({ timeout: 120_000 })

  const treeArea = page.locator('[data-context-kind="file-tree-empty"]').first()
  await treeArea.click({ button: 'right' })
  await expect(page.getByTestId('app-context-menu')).toBeVisible()
})
