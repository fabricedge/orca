import { useAppStore } from '@/store'
import { rightSidebarOpenPatch } from '@/store/slices/editor/actions/right-sidebar-state'
import {
  sidebarVisibility,
  type WorkspaceChromeChange,
  type WorkspaceChromeResult
} from '../../../../shared/workspace-layout-chrome'

export function executeWorkspaceChrome(
  workspaceId: string,
  change: WorkspaceChromeChange
): WorkspaceChromeResult {
  const state = useAppStore.getState()
  if (state.activeWorktreeId !== workspaceId) {
    throw new Error('workspace_chrome_inactive_workspace')
  }
  const current = {
    left: { open: state.sidebarOpen, width: state.sidebarWidth },
    right: { open: state.rightSidebarOpen, width: state.rightSidebarWidth }
  }
  const proposed = {
    left: { ...current.left, open: sidebarVisibility(current.left.open, change.left) },
    right: { ...current.right, open: sidebarVisibility(current.right.open, change.right) }
  }
  if (!change.dryRun && (change.left || change.right)) {
    useAppStore.setState({
      ...(change.left ? { sidebarOpen: proposed.left.open } : {}),
      ...(change.right ? rightSidebarOpenPatch(proposed.right.open) : {})
    })
  }
  return { workspaceId, dryRun: change.dryRun === true, current, proposed }
}
