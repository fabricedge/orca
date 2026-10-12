import { useAppStore } from '@/store'
import { readWorkspaceTabTopology } from '@/components/tab-bar/workspace-tab-location'
import { describeWorkspaceTabLayout } from '../../../../shared/workspace-tab-location'

export function registerWorkspaceLayoutIpcBridge(unsubs: (() => void)[]): void {
  const unsubscribe = window.api.ui.onWorkspaceLayoutRequest?.((request) => {
    try {
      if (Date.now() >= request.expiresAt) {
        throw new Error('layout_request_expired')
      }
      if (!useAppStore.getState().unifiedTabsByWorktree[request.workspaceId]) {
        throw new Error('workspace_layout_not_loaded')
      }
      window.api.ui.respondWorkspaceLayout({
        requestId: request.requestId,
        layout: describeWorkspaceTabLayout(
          request.workspaceId,
          readWorkspaceTabTopology(request.workspaceId),
          'open',
          useAppStore.getState().activeWorktreeId === request.workspaceId
        )
      })
    } catch (error) {
      window.api.ui.respondWorkspaceLayout({
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'workspace_layout_failed'
      })
    }
  })
  if (unsubscribe) {
    unsubs.push(unsubscribe)
  }
}
