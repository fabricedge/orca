import { randomUUID } from 'node:crypto'
import { arrangeWorkspaceTabs } from '../../shared/workspace-tab-arrangement'
import {
  describeWorkspaceTabLayout,
  type WorkspaceTabLayoutAction,
  type WorkspaceTabLayoutDescription,
  type WorkspaceTabTopology
} from '../../shared/workspace-tab-location'

export function previewWorkspaceLayout(
  current: WorkspaceTabLayoutDescription,
  action: WorkspaceTabLayoutAction
) {
  const topology: WorkspaceTabTopology = {
    tabs: current.tabs.map((tab) => ({
      id: tab.tabId,
      entityId: tab.contentId,
      worktreeId: current.workspaceId,
      groupId: tab.groupId,
      contentType: tab.type,
      ...(tab.executionHostId ? { executionHostId: tab.executionHostId } : {}),
      label: tab.title,
      customLabel: null,
      color: null,
      isPinned: tab.isPinned,
      sortOrder: tab.position ?? 0,
      createdAt: 0
    })),
    groups: current.groups.map((group) => ({
      id: group.groupId,
      worktreeId: current.workspaceId,
      activeTabId: group.activeTabId,
      tabOrder: group.tabOrder
    })),
    layout: current.layout,
    activeGroupId: current.activeGroupId
  }
  const next = arrangeWorkspaceTabs(current.workspaceId, topology, action, randomUUID)
  const proposed = describeWorkspaceTabLayout(current.workspaceId, next, current.availability)
  return {
    dryRun: true as const,
    basedOnRevision: current.revision,
    action,
    proposed,
    createdGroupIds: proposed.groups
      .filter((group) => !current.groups.some((old) => old.groupId === group.groupId))
      .map((group) => group.groupId),
    changedTabs: proposed.tabs.flatMap((tab) => {
      const previous = current.tabs.find((old) => old.tabId === tab.tabId)
      if (
        previous?.groupId === tab.groupId &&
        previous.position === tab.position &&
        JSON.stringify(previous.bounds) === JSON.stringify(tab.bounds)
      ) {
        return []
      }
      return [
        {
          tabId: tab.tabId,
          from: {
            groupId: previous?.groupId,
            position: previous?.position,
            bounds: previous?.bounds
          },
          to: { groupId: tab.groupId, position: tab.position, bounds: tab.bounds }
        }
      ]
    })
  }
}
