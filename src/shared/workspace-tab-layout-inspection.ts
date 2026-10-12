import type { WorkspaceTabLayoutDescription } from './workspace-tab-location'

export type WorkspaceTabLayoutRequest = {
  requestId: string
  workspaceId: string
  expiresAt: number
}

export type WorkspaceTabLayoutResponse = {
  requestId: string
  layout?: WorkspaceTabLayoutDescription
  error?: string
}
