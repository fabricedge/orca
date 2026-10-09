import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceTabLayoutRequest } from '../../shared/workspace-tab-location'
import { describeWorkspaceTabLayout } from '../../shared/workspace-tab-location'

const ipc = new EventEmitter()
vi.mock('electron', () => ({ ipcMain: ipc }))

async function setup(chrome = false) {
  const { requestWorkspaceLayoutFromRenderer, requestWorkspaceChromeFromRenderer } =
    await import('./workspace-layout-request-relay')
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: vi.fn<(channel: string, request: WorkspaceTabLayoutRequest) => void>()
  })
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false, webContents })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The relay only uses the lifecycle, send and destruction methods implemented by this test double.
  const owner = window as unknown as BrowserWindow
  const pending = chrome
    ? requestWorkspaceChromeFromRenderer(owner, {
        workspaceId: 'workspace',
        chrome: { left: 'hide' }
      })
    : requestWorkspaceLayoutFromRenderer(owner, { workspaceId: 'workspace' })
  const request = webContents.send.mock.calls[0][1]
  return { pending, request, webContents, window }
}

beforeEach(() => ipc.removeAllListeners())
afterEach(() => vi.useRealTimers())

describe('workspace layout request relay', () => {
  it('relays sidebar responses through the same owner and request checks', async () => {
    const { pending, request, webContents } = await setup(true)
    expect(request.chrome).toEqual({ left: 'hide' })
    const current = { left: { open: true, width: 300 }, right: { open: false, width: 400 } }
    const chrome = {
      workspaceId: 'workspace',
      dryRun: false,
      current,
      proposed: { ...current, left: { open: false, width: 300 } }
    }
    ipc.emit('ui:workspaceLayoutResponse', { sender: {} }, { requestId: request.requestId, chrome })
    expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(1)
    ipc.emit(
      'ui:workspaceLayoutResponse',
      { sender: webContents },
      { requestId: request.requestId, chrome }
    )
    await expect(pending).resolves.toEqual(chrome)
    expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(0)
  })

  it('rejects a sidebar request if its desktop owner disappears', async () => {
    const { pending, webContents } = await setup(true)
    webContents.emit('destroyed')
    await expect(pending).rejects.toThrow('layout_owner_unavailable')
  })

  it('accepts only the requested renderer and request ID, then releases listeners', async () => {
    const { pending, request, webContents } = await setup()
    const layout = describeWorkspaceTabLayout(
      'workspace',
      { tabs: [], groups: [], layout: null, activeGroupId: null },
      'open'
    )
    ipc.emit('ui:workspaceLayoutResponse', { sender: {} }, { requestId: request.requestId, layout })
    ipc.emit('ui:workspaceLayoutResponse', { sender: webContents }, { requestId: 'wrong', layout })
    expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(1)
    ipc.emit(
      'ui:workspaceLayoutResponse',
      { sender: webContents },
      { requestId: request.requestId, layout }
    )
    await expect(pending).resolves.toEqual(layout)
    expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(0)
    expect(webContents.listenerCount('destroyed')).toBe(0)
  })

  it('propagates a rejected revision', async () => {
    const { pending, request, webContents } = await setup()
    ipc.emit(
      'ui:workspaceLayoutResponse',
      { sender: webContents },
      { requestId: request.requestId, error: 'stale_workspace_layout' }
    )
    await expect(pending).rejects.toThrow('stale_workspace_layout')
  })

  it.each(['destroyed', 'render-process-gone', 'did-start-loading'])(
    'rejects when the owner emits %s',
    async (event) => {
      const { pending, webContents } = await setup()
      webContents.emit(event)
      await expect(pending).rejects.toThrow('layout_owner_unavailable')
      expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(0)
    }
  )

  it('expires and releases listeners when the owner never responds', async () => {
    vi.useFakeTimers()
    const { pending, webContents } = await setup()
    const rejection = expect(pending).rejects.toThrow('layout_owner_timeout')
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(ipc.listenerCount('ui:workspaceLayoutResponse')).toBe(0)
    expect(webContents.listenerCount('did-start-loading')).toBe(0)
  })
})
