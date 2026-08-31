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
  await expect(page.getByTestId('map-minimap')).toBeVisible()
  await expect(page.getByTestId('map-tool-rail')).toBeVisible()
  await expect(page.getByRole('button', { name: /^桥$|^Bridge$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /矿脉洞|Veinhole/ })).toBeVisible()
  await page.getByRole('button', { name: /地图工具|Map tools/ }).click()
  await expect(page.getByTestId('map-user-script')).toBeVisible()
  await expect(page.getByTestId('map-search-waypoint')).toBeVisible()
  await page.getByRole('button', { name: /矿石|Ore/ }).first().click()
  await page.getByRole('button', { name: /阵营|Houses/ }).click()
  await expect(page.getByTestId('map-logic-panel').getByText('Americans')).toBeVisible()
  await page.getByRole('button', { name: /触发器|Triggers/ }).click()
  await page.getByRole('button', { name: /添加触发器|Add trigger/ }).click()
  await expect(page.getByTestId('map-event-type')).toBeVisible()
  await page.getByRole('button', { name: /AI 触发|AI triggers/ }).click()
  await expect(page.getByTestId('map-ai-panel')).toBeVisible()
})
