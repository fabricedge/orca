import { executeWorkspaceChrome } from './workspace-chrome-command'
import { useAppStore } from '@/store'
import { buildActiveSurfacePatch } from '@/store/slices/tabs/tabs-surface'
import { ownsGlobalSelection } from '@/store/global-selection-owner'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { readWorkspaceTabTopology } from '@/components/tab-bar/workspace-tab-location'
import { arrangeWorkspaceTabs } from '../../../../shared/workspace-tab-arrangement'
import {
  describeWorkspaceTabLayout,
  workspaceTabLayoutRevision
} from '../../../../shared/workspace-tab-location'

export function registerWorkspaceLayoutIpcBridge(unsubs: (() => void)[]): void {
  const unsubscribe = window.api.ui.onWorkspaceLayoutRequest?.((request) => {
    try {
      if (Date.now() >= request.expiresAt) {
        throw new Error('layout_request_expired')
      }
      if (request.chrome) {
        if (request.action) {
          throw new Error('invalid_layout_request')
        }
        window.api.ui.respondWorkspaceLayout({
          requestId: request.requestId,
          chrome: executeWorkspaceChrome(request.workspaceId, request.chrome)
        })
        return
      }
      if (!useAppStore.getState().unifiedTabsByWorktree[request.workspaceId]) {
        throw new Error('workspace_layout_not_loaded')
      }
      const topology = readWorkspaceTabTopology(request.workspaceId)
      if (request.action) {
        if (request.expectedRevision !== workspaceTabLayoutRevision(topology)) {
          throw new Error('stale_workspace_layout')
        }
        const next = arrangeWorkspaceTabs(
          request.workspaceId,
          topology,
          request.action,
          createBrowserUuid
        )
        useAppStore.setState((state) => {
          const patch = {
            unifiedTabsByWorktree: {
              ...state.unifiedTabsByWorktree,
              [request.workspaceId]: next.tabs
            },
            groupsByWorktree: { ...state.groupsByWorktree, [request.workspaceId]: next.groups },
            layoutByWorktree: next.layout
              ? { ...state.layoutByWorktree, [request.workspaceId]: next.layout }
              : state.layoutByWorktree,
            activeGroupIdByWorktree: next.activeGroupId
              ? { ...state.activeGroupIdByWorktree, [request.workspaceId]: next.activeGroupId }
              : state.activeGroupIdByWorktree
          }
          return {
            ...patch,
            ...(ownsGlobalSelection(state, request.workspaceId)
              ? buildActiveSurfacePatch(
                  { ...state, ...patch },
                  request.workspaceId,
                  next.activeGroupId
                )
              : {})
          }
        })
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
