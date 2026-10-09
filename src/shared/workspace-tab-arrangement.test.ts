import { describe, expect, it } from 'vitest'
import { arrangeWorkspaceTabs } from './workspace-tab-arrangement'
import { collectTabGroupBounds, type WorkspaceTabTopology } from './workspace-tab-location'
import type { Tab } from './tab-types'

function topology(): WorkspaceTabTopology {
  const tabs: Tab[] = ['a', 'b', 'c', 'd', 'keep', 'other'].map((id, index) => ({
    id,
    entityId: `content-${id}`,
    worktreeId: 'folder:workspace',
    groupId: id === 'other' ? 'g2' : 'g1',
    contentType:
      index === 1 ? 'editor' : index === 2 ? 'browser' : index === 3 ? 'agent-session' : 'terminal',
    label: id,
    customLabel: null,
    color: null,
    sortOrder: index,
    createdAt: 0,
    isPinned: id === 'a'
  }))
  return {
    tabs,
    groups: [
      {
        id: 'g1',
        worktreeId: 'folder:workspace',
        tabOrder: ['a', 'b', 'c', 'd', 'keep'],
        activeTabId: 'a'
      },
      { id: 'g2', worktreeId: 'folder:workspace', tabOrder: ['other'], activeTabId: 'other' }
    ],
    layout: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.25,
      first: { type: 'leaf', groupId: 'g1' },
      second: { type: 'leaf', groupId: 'g2' }
    },
    activeGroupId: 'g1'
  }
}

function groupIds(): () => string {
  let next = 0
  return () => `new-${++next}`
}

describe('workspace tab arrangement', () => {
  it('builds an equal grid beside untouched groups, preserving tab identities and content', () => {
    const state = topology()
    const before = structuredClone(state)
    const next = arrangeWorkspaceTabs(
      'folder:workspace',
      state,
      { kind: 'grid-2x2', tabIds: ['a', 'b', 'c', 'd'] },
      groupIds()
    )
    expect(state).toEqual(before)
    expect(next.groups.slice(0, 2).map((g) => g.tabOrder)).toEqual([['keep'], ['other']])
    expect(next.groups.slice(2).map((g) => g.activeTabId)).toEqual(['a', 'b', 'c', 'd'])
    expect(next.tabs.map((t) => [t.id, t.entityId, t.isPinned])).toEqual(
      state.tabs.map((t) => [t.id, t.entityId, t.isPinned])
    )
    const bounds = collectTabGroupBounds(next.layout)
    expect(bounds.get('new-1')).toEqual({ x: 0.5, y: 0, width: 0.25, height: 0.5 })
    expect(bounds.get('new-4')).toEqual({ x: 0.75, y: 0.5, width: 0.25, height: 0.5 })
    expect(bounds.get('g1')?.width).toBe(0.125)
  })

  it('fills the workspace with the grid when all original groups become empty', () => {
    const state = topology()
    state.tabs = state.tabs.slice(0, 4)
    state.groups = [{ ...state.groups[0], tabOrder: ['a', 'b', 'c', 'd'] }]
    state.layout = { type: 'leaf', groupId: 'g1' }
    const next = arrangeWorkspaceTabs(
      'folder:workspace',
      state,
      { kind: 'grid-2x2', tabIds: ['a', 'b', 'c', 'd'] },
      groupIds()
    )
    expect(next.groups).toHaveLength(4)
    expect(collectTabGroupBounds(next.layout).get('new-4')).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5
    })
  })

  it('moves a tab across groups and updates its owner', () => {
    const next = arrangeWorkspaceTabs(
      'folder:workspace',
      topology(),
      { kind: 'move', tabId: 'b', groupId: 'g2', index: 0 },
      groupIds()
    )
    expect(next.groups[1].tabOrder).toEqual(['b', 'other'])
    expect(next.tabs[1].groupId).toBe('g2')
  })

  it('reorders within the same group without changing group focus', () => {
    const next = arrangeWorkspaceTabs(
      'folder:workspace',
      topology(),
      { kind: 'move', tabId: 'b', groupId: 'g1', index: 3 },
      groupIds()
    )
    expect(next.groups[0].tabOrder).toEqual(['a', 'c', 'd', 'b', 'keep'])
    expect(next.activeGroupId).toBe('g1')
    expect(next.groups[0].activeTabId).toBe('a')
  })

  it('rejects moves across the pinned-tab boundary', () => {
    for (const [tabId, index] of [
      ['a', 2],
      ['b', 0]
    ] as const) {
      expect(() =>
        arrangeWorkspaceTabs(
          'folder:workspace',
          topology(),
          {
            kind: 'move',
            tabId,
            groupId: 'g1',
            index
          },
          groupIds()
        )
      ).toThrow('invalid_pinned_tab_position')
    }
  })

  it('keeps unrelated empty groups when creating a grid', () => {
    const state = topology()
    state.groups.push({
      id: 'empty',
      worktreeId: 'folder:workspace',
      tabOrder: [],
      activeTabId: null
    })
    state.layout = {
      type: 'split',
      direction: 'vertical',
      first: state.layout!,
      second: { type: 'leaf', groupId: 'empty' }
    }
    const next = arrangeWorkspaceTabs(
      'folder:workspace',
      state,
      {
        kind: 'grid-2x2',
        tabIds: ['a', 'b', 'c', 'd']
      },
      groupIds()
    )
    expect(next.groups.find((group) => group.id === 'empty')?.tabOrder).toEqual([])
    expect(collectTabGroupBounds(next.layout).has('empty')).toBe(true)
  })

  it.each(['left', 'right', 'up', 'down'] as const)(
    'splits an existing tab %s without creating content',
    (direction) => {
      const state = topology()
      const next = arrangeWorkspaceTabs(
        'folder:workspace',
        state,
        { kind: 'split', tabId: 'b', groupId: 'g1', direction },
        groupIds()
      )
      expect(next.tabs).toHaveLength(state.tabs.length)
      expect(next.groups.find((g) => g.id === 'new-1')?.tabOrder).toEqual(['b'])
      expect(next.tabs[1].groupId).toBe('new-1')
    }
  )

  it('rejects duplicate and missing tabs or invalid insertion positions without changing state', () => {
    const state = topology()
    const before = structuredClone(state)
    expect(() =>
      arrangeWorkspaceTabs(
        'folder:workspace',
        state,
        { kind: 'grid-2x2', tabIds: ['a', 'a', 'b', 'c'] },
        groupIds()
      )
    ).toThrow('invalid_tab_selection')
    expect(() =>
      arrangeWorkspaceTabs(
        'folder:workspace',
        state,
        { kind: 'grid-2x2', tabIds: ['a', 'b', 'c', 'missing'] },
        groupIds()
      )
    ).toThrow('tab_not_found')
    expect(() =>
      arrangeWorkspaceTabs(
        'folder:workspace',
        state,
        { kind: 'move', tabId: 'b', groupId: 'g1', index: 999 },
        groupIds()
      )
    ).toThrow('invalid_tab_position')
    expect(state).toEqual(before)
  })
})
