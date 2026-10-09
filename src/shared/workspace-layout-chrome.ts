export type SidebarVisibility = 'show' | 'hide' | 'toggle'
export type WorkspaceChromeChange = {
  left?: SidebarVisibility
  right?: SidebarVisibility
  dryRun?: boolean
}
export type WorkspaceChromeState = {
  left: { open: boolean; width: number }
  right: { open: boolean; width: number }
}
export type WorkspaceChromeResult = {
  workspaceId: string
  dryRun: boolean
  current: WorkspaceChromeState
  proposed: WorkspaceChromeState
}

export function sidebarVisibility(current: boolean, action?: SidebarVisibility): boolean {
  return action === 'toggle'
    ? !current
    : action === 'show'
      ? true
      : action === 'hide'
        ? false
        : current
}
