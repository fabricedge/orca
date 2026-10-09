import type { WorkspaceChromeResult } from '../../src/shared/workspace-layout-chrome'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree } from './helpers/store'
import { createTerminalTabFromMenu, SORTABLE_TAB } from './helpers/terminal-tab-menu'
import { RuntimeClient } from '../../src/cli/runtime/client'
import type { WorkspaceTabLayoutDescription } from '../../src/shared/workspace-tab-location'

test('copies a tab reference and details, then renders four existing tabs as a grid', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await ensureTerminalVisible(orcaPage)
  const workspaceId = await waitForActiveWorktree(orcaPage)
  await expect(orcaPage.locator(SORTABLE_TAB)).toHaveCount(1)
  for (let index = 0; index < 3; index++) {
    await createTerminalTabFromMenu(orcaPage)
  }
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const client = new RuntimeClient(userData, 30_000, null, null)
  const worktree = `id:${workspaceId}`
  const before = (
    await client.call<WorkspaceTabLayoutDescription>('workspace.layout.show', { worktree })
  ).result
  const selected = before.tabs.slice(0, 4)
  expect(selected).toHaveLength(4)
  const savedClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  try {
    await orcaPage.locator(SORTABLE_TAB).first().click({ button: 'right' })
    await orcaPage.getByRole('menuitem', { name: 'Copy Tab ID', exact: true }).click()
    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(`orcaTabId: ${selected[0].tabId}`)
    await orcaPage.locator(SORTABLE_TAB).first().click({ button: 'right' })
    await orcaPage.getByRole('menuitem', { name: 'Copy Tab Details', exact: true }).click()
    await expect
      .poll(async () => {
        const text = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
        return text.startsWith('{') ? JSON.parse(text).tabs[0].tabId : null
      })
      .toBe(selected[0].tabId)
    await orcaPage.screenshot({ path: testInfo.outputPath('before-grid.png') })
    await client.call('workspace.layout.change', {
      worktree,
      expectedRevision: before.revision,
      action: { kind: 'grid-2x2', tabIds: selected.map((tab) => tab.tabId) }
    })
    const strips = orcaPage.locator(`[data-tab-group-strip-id][data-worktree-id="${workspaceId}"]`)
    await expect(strips).toHaveCount(4)
    for (const strip of await strips.all()) {
      await expect(strip.locator(SORTABLE_TAB)).toHaveCount(1)
    }
    await orcaPage.screenshot({ path: testInfo.outputPath('tab-grid.png') })
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
  } finally {
    await electronApp.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard)
  }
})

test('controls both sidebars without changing the tab layout', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  await ensureTerminalVisible(orcaPage)
  const workspaceId = await waitForActiveWorktree(orcaPage)
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const client = new RuntimeClient(userData, 30_000, null, null)
  const worktree = `id:${workspaceId}`
  const initial = (
    await client.call<WorkspaceChromeResult>('workspace.layout.chrome', { worktree })
  ).result.current
  const tabs = (
    await client.call<WorkspaceTabLayoutDescription>('workspace.layout.show', { worktree })
  ).result
  try {
    await client.call('workspace.layout.chrome', { worktree, left: 'show', right: 'show' })
    await expect
      .poll(() =>
        orcaPage.evaluate(() => {
          const state = window.__store?.getState()
          return state?.sidebarOpen && state.rightSidebarOpen
        })
      )
      .toBe(true)
    await orcaPage.screenshot({ path: testInfo.outputPath('sidebars-shown.png') })
    const preview = (
      await client.call<WorkspaceChromeResult>('workspace.layout.chrome', {
        worktree,
        left: 'hide',
        right: 'hide',
        dryRun: true
      })
    ).result
    expect(preview.current.left.open).toBe(true)
    expect(preview.proposed.left.open).toBe(false)
    expect(preview.proposed.right.open).toBe(false)
    expect(
      (await client.call<WorkspaceChromeResult>('workspace.layout.chrome', { worktree })).result
        .current.left.open
    ).toBe(true)
    await client.call('workspace.layout.chrome', { worktree, left: 'hide', right: 'hide' })
    await expect
      .poll(() =>
        orcaPage.evaluate(() => {
          const state = window.__store?.getState()
          return state?.sidebarOpen === false && state.rightSidebarOpen === false
        })
      )
      .toBe(true)
    await orcaPage.screenshot({ path: testInfo.outputPath('sidebars-hidden.png') })
    expect(
      (await client.call<WorkspaceTabLayoutDescription>('workspace.layout.show', { worktree }))
        .result.revision
    ).toBe(tabs.revision)
    // Restore through the same store actions used by the UI controls.
    await orcaPage.evaluate(() => {
      window.__store?.getState().setSidebarOpen(true)
      window.__store?.getState().setRightSidebarOpen(true)
    })
    const restored = (
      await client.call<WorkspaceChromeResult>('workspace.layout.chrome', { worktree })
    ).result.current
    expect(restored.left).toEqual({ open: true, width: initial.left.width })
    expect(restored.right).toEqual({ open: true, width: initial.right.width })
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
  } finally {
    await client.call('workspace.layout.chrome', {
      worktree,
      left: initial.left.open ? 'show' : 'hide',
      right: initial.right.open ? 'show' : 'hide'
    })
  }
})
