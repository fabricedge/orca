import type {
  WorkspaceChromeChange,
  WorkspaceChromeResult
} from '../../shared/workspace-layout-chrome'
import { randomUUID } from 'node:crypto'
import { ipcMain, type BrowserWindow } from 'electron'
import type {
  WorkspaceTabLayoutRequest,
  WorkspaceTabLayoutResponse,
  WorkspaceTabLayoutDescription
} from '../../shared/workspace-tab-location'

export async function requestWorkspaceLayoutFromRenderer(
  window: BrowserWindow,
  payload: Omit<WorkspaceTabLayoutRequest, 'requestId' | 'expiresAt'>
): Promise<WorkspaceTabLayoutDescription> {
  const response = await requestWorkspaceLayoutResponse(window, payload)
  if (!response.layout) {
    throw new Error('workspace_layout_response_missing')
  }
  return response.layout
}

export async function requestWorkspaceChromeFromRenderer(
  window: BrowserWindow,
  payload: { workspaceId: string; chrome: WorkspaceChromeChange }
): Promise<WorkspaceChromeResult> {
  const response = await requestWorkspaceLayoutResponse(window, payload)
  if (!response.chrome) {
    throw new Error('workspace_chrome_response_missing')
  }
  return response.chrome
}

function requestWorkspaceLayoutResponse(
  window: BrowserWindow,
  payload: Omit<WorkspaceTabLayoutRequest, 'requestId' | 'expiresAt'>
): Promise<WorkspaceTabLayoutResponse> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('layout_owner_unavailable'))
  }
  const webContents = window.webContents
  const request: WorkspaceTabLayoutRequest = {
    ...payload,
    requestId: randomUUID(),
    expiresAt: Date.now() + 10_000
  }
  return new Promise((resolve, reject) => {
    const unavailable = (): void => finish(new Error('layout_owner_unavailable'))
    const respond = (event: Electron.IpcMainEvent, response: WorkspaceTabLayoutResponse): void => {
      if (event.sender !== webContents || response.requestId !== request.requestId) {
        return
      }
      finish(response.error ? new Error(response.error) : undefined, response)
    }
    let settled = false
    const finish = (error?: Error, response?: WorkspaceTabLayoutResponse): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      ipcMain.removeListener('ui:workspaceLayoutResponse', respond)
      window.removeListener('closed', unavailable)
      webContents.removeListener('destroyed', unavailable)
      webContents.removeListener('render-process-gone', unavailable)
      webContents.removeListener('did-start-loading', unavailable)
      if (error || !response) {
        reject(error ?? new Error('workspace_layout_response_missing'))
      } else {
        resolve(response)
      }
    }
    const timeout = setTimeout(() => finish(new Error('layout_owner_timeout')), 10_000)
    timeout.unref()
    ipcMain.on('ui:workspaceLayoutResponse', respond)
    window.once('closed', unavailable)
    webContents.once('destroyed', unavailable)
    webContents.once('render-process-gone', unavailable)
    webContents.once('did-start-loading', unavailable)
    try {
      webContents.send('ui:workspaceLayoutRequest', request)
    } catch {
      unavailable()
    }
  })
}
