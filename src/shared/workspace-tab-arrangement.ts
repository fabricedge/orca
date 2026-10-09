import type { TabGroup, TabGroupLayoutNode } from './tab-types'
import type { WorkspaceTabLayoutAction, WorkspaceTabTopology } from './workspace-tab-location'
import {
  buildHeadlessTabGroupMove,
  buildHeadlessTabGroupSplit,
  removeTabGroupLayoutLeaf
} from './tab-group-layout-mutations'

function gridLayout(groupIds: string[]): TabGroupLayoutNode {
  const [a, b, c, d] = groupIds
  const leaf = (groupId: string): TabGroupLayoutNode => ({ type: 'leaf', groupId })
  return {
    type: 'split',
    direction: 'vertical',
    ratio: 0.5,
    first: { type: 'split', direction: 'horizontal', ratio: 0.5, first: leaf(a), second: leaf(b) },
    second: { type: 'split', direction: 'horizontal', ratio: 0.5, first: leaf(c), second: leaf(d) }
  }
}

export function arrangeWorkspaceTabs(
  workspaceId: string,
  topology: WorkspaceTabTopology,
  action: WorkspaceTabLayoutAction,
  createGroupId: () => string
): WorkspaceTabTopology {
  const selected = action.kind === 'grid-2x2' ? action.tabIds : [action.tabId]
  if (
    (action.kind === 'grid-2x2' && selected.length !== 4) ||
    new Set(selected).size !== selected.length
  ) {
    throw new Error('invalid_tab_selection')
  }
  const tabs = new Map(topology.tabs.map((tab) => [tab.id, tab]))
  for (const id of selected) {
    const tab = tabs.get(id)
    if (
      !tab ||
      !topology.groups.some((group) => group.id === tab.groupId && group.tabOrder.includes(id))
    ) {
      throw new Error('tab_not_found')
    }
  }
  let groups: TabGroup[]
  let layout: TabGroupLayoutNode | null
  if (action.kind === 'grid-2x2') {
    layout = topology.layout
    groups = topology.groups.flatMap((group) => {
      if (!group.tabOrder.some((id) => selected.includes(id))) {
        return [group]
      }
      const tabOrder = group.tabOrder.filter((id) => !selected.includes(id))
      if (!tabOrder.length) {
        layout = removeTabGroupLayoutLeaf(layout, group.id)
        return []
      }
      return [
        {
          ...group,
          tabOrder,
          activeTabId:
            group.activeTabId && tabOrder.includes(group.activeTabId)
              ? group.activeTabId
              : tabOrder[0],
          recentTabIds: group.recentTabIds?.filter((id) => tabOrder.includes(id))
        }
      ]
    })
    const newGroups = selected.map((id) => ({
      id: createGroupId(),
      worktreeId: workspaceId,
      activeTabId: id,
      tabOrder: [id]
    }))
    const grid = gridLayout(newGroups.map((group) => group.id))
    layout = layout
      ? { type: 'split', direction: 'horizontal', ratio: 0.5, first: layout, second: grid }
      : grid
    groups.push(...newGroups)
  } else {
    const target = topology.groups.find((group) => group.id === action.groupId)
    if (!target) {
      throw new Error('target_group_not_found')
    }
    if (action.kind === 'move') {
      const remaining = target.tabOrder.filter((id) => id !== action.tabId)
      const pinnedCount = remaining.filter((id) => tabs.get(id)?.isPinned).length
      const isPinned = tabs.get(action.tabId)?.isPinned === true
      if (isPinned ? action.index > pinnedCount : action.index < pinnedCount) {
        throw new Error('invalid_pinned_tab_position')
      }
    }
    const source = topology.groups.find((group) => group.tabOrder.includes(action.tabId))!
    if (action.kind === 'move' && source.id === target.id) {
      const tabOrder = target.tabOrder.filter((id) => id !== action.tabId)
      if (!Number.isInteger(action.index) || action.index < 0 || action.index > tabOrder.length) {
        throw new Error('invalid_tab_position')
      }
      tabOrder.splice(action.index, 0, action.tabId)
      groups = topology.groups.map((group) =>
        group.id === target.id ? { ...group, tabOrder } : group
      )
      layout = topology.layout
    } else {
      if (
        action.kind === 'move' &&
        (!Number.isInteger(action.index) ||
          action.index < 0 ||
          action.index > target.tabOrder.length)
      ) {
        throw new Error('invalid_tab_position')
      }
      const result =
        action.kind === 'split'
          ? buildHeadlessTabGroupSplit({
              groups: topology.groups,
              layout: topology.layout,
              tabId: action.tabId,
              targetGroupId: action.groupId,
              splitDirection: action.direction,
              newGroupId: createGroupId()
            })
          : buildHeadlessTabGroupMove({
              groups: topology.groups,
              layout: topology.layout,
              tabId: action.tabId,
              targetGroupId: action.groupId,
              index: action.index
            })
      if (!result) {
        return topology
      }
      groups = result.groups.map((group) => ({ ...group, worktreeId: workspaceId }))
      layout = result.layout
    }
  }
  const owners = new Map(
    groups.flatMap((group) =>
      group.tabOrder.map((id, index) => [id, { groupId: group.id, index }] as const)
    )
  )
  if (owners.size !== groups.reduce((count, group) => count + group.tabOrder.length, 0)) {
    throw new Error('invalid_tab_topology')
  }
  groups = groups.map((group) => ({
    ...group,
    recentTabIds: group.recentTabIds?.filter((id) => group.tabOrder.includes(id))
  }))
  return {
    tabs: topology.tabs.map((tab) => {
      const owner = owners.get(tab.id)
      if (!owner) {
        throw new Error('invalid_tab_topology')
      }
      return { ...tab, groupId: owner.groupId, sortOrder: owner.index }
    }),
    groups,
    layout,
    activeGroupId: groups.some((group) => group.id === topology.activeGroupId)
      ? topology.activeGroupId
      : (groups[0]?.id ?? null)
  }
}
