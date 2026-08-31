import { expect, test } from '@playwright/test'
import { seedStudioWorkspace } from './utils/studioFixtures'

test('can create a new FA2 map and open the editor', async ({ page }) => {
  await seedStudioWorkspace(page)

  await page.getByRole('button', { name: /项目管理|Projects/ }).click()
  await expect(page.getByText(/当前还没有项目|No projects yet/)).toBeVisible()
  await page.getByRole('button', { name: /创建项目|Create Project/ }).first().click()
  await expect(page.getByRole('heading', { name: /创建项目|Create Project/ })).toBeVisible()
  await page.locator('.fixed.inset-0 input[type="text"]').fill('Map Project')
  await page.locator('.fixed.inset-0').getByRole('button', { name: /^确定$|^OK$/ }).click()
  await expect(page.getByRole('button', { name: /新建地图|New map/ })).toBeEnabled()

  await page.getByRole('button', { name: /新建地图|New map/ }).click()
  const newMap = page.getByTestId('new-map-dialog')
  await expect(newMap).toBeVisible()
  await newMap.getByRole('button', { name: /^确定$|^OK$/ }).click()

  await expect(page.getByTestId('map-editor')).toBeVisible()
  await expect(page.getByTestId('map-viewport')).toBeVisible()
  await expect(page.getByTestId('map-tool-rail')).toBeVisible()
  await page.getByRole('button', { name: /矿石|Ore/ }).first().click()
  await page.getByRole('button', { name: /阵营|Houses/ }).click()
  await expect(page.getByTestId('map-logic-panel').getByText('Americans')).toBeVisible()
})
