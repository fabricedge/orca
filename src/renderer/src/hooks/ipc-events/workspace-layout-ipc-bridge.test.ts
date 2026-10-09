import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  WorkspaceTabLayoutRequest,
  WorkspaceTabTopology
} from '../../../../shared/workspace-tab-location'
import { workspaceTabLayoutRevision } from '../../../../shared/workspace-tab-location'
import { registerWorkspaceLayoutIpcBridge } from './workspace-layout-ipc-bridge'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: mocks }))
vi.mock('@/store/global-selection-owner', () => ({ ownsGlobalSelection: () => false }))
vi.mock('@/store/slices/tabs/tabs-surface', () => ({ buildActiveSurfacePatch: () => ({}) }))
vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'new-group' }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function setup() {
  const topology: WorkspaceTabTopology = {
    tabs: ['a', 'b'].map((id, sortOrder) => ({
      id,
      entityId: `content-${id}`,
      groupId: 'g1',
      worktreeId: 'workspace',
      label: id,
      contentType: 'terminal',
      customLabel: null,
      color: null,
      sortOrder,
      createdAt: 0
    })),
    groups: [{ id: 'g1', worktreeId: 'workspace', tabOrder: ['a', 'b'], activeTabId: 'a' }],
    layout: { type: 'leaf', groupId: 'g1' },
    activeGroupId: 'g1'
  }
  const state = {
    unifiedTabsByWorktree: { workspace: topology.tabs },
    groupsByWorktree: { workspace: topology.groups },
    layoutByWorktree: { workspace: topology.layout },
    activeGroupIdByWorktree: { workspace: 'g1' },
    activeWorktreeId: 'another-workspace'
  }
  mocks.getState.mockReturnValue(state)
  mocks.setState.mockImplementation((update: (current: typeof state) => Partial<typeof state>) =>
    Object.assign(state, update(state))
  )
  let listener: ((request: WorkspaceTabLayoutRequest) => void) | undefined
  const respond = vi.fn()
  const unsubscribe = vi.fn()
  vi.stubGlobal('window', {
    api: {
      ui: {
        onWorkspaceLayoutRequest: (callback: typeof listener) => {
          listener = callback
          return unsubscribe
        },
        respondWorkspaceLayout: respond
      }
    }
  })
  const unsubs: (() => void)[] = []
  registerWorkspaceLayoutIpcBridge(unsubs)
  const send = (request: Partial<WorkspaceTabLayoutRequest> = {}): void => {
    listener?.({
      requestId: 'req',
      workspaceId: 'workspace',
      expiresAt: Date.now() + 10_000,
      ...request
    })
  }
  return { state, topology, send, respond, unsubs, unsubscribe }
}

describe('workspace layout IPC', () => {
  it('distinguishes an unloaded workspace from an empty open workspace', () => {
    const { send, respond } = setup()
    send({ workspaceId: 'not-loaded' })
    expect(respond).toHaveBeenCalledWith({ requestId: 'req', error: 'workspace_layout_not_loaded' })
    expect(mocks.setState).not.toHaveBeenCalled()
  })
  it('reads open tab records without changing state or claiming an inactive workspace is displayed', () => {
    const { send, respond, unsubs, unsubscribe } = setup()
    send()
    expect(mocks.setState).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({ availability: 'open', isWorkspaceActive: false })
      })
    )
    unsubs[0]()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects a stale revision and an expired request without any mutation', () => {
    const { send, respond } = setup()
    send({ expectedRevision: 'old', action: { kind: 'move', tabId: 'a', groupId: 'g1', index: 1 } })
    expect(respond).toHaveBeenLastCalledWith({ requestId: 'req', error: 'stale_workspace_layout' })
    send({ expiresAt: 0 })
    expect(respond).toHaveBeenLastCalledWith({ requestId: 'req', error: 'layout_request_expired' })
    expect(mocks.setState).not.toHaveBeenCalled()
  })

  it('applies one atomic change, preserves unrelated selection and returns the new layout', () => {
    const { topology, state, send, respond } = setup()
    send({
      expectedRevision: workspaceTabLayoutRevision(topology),
      action: { kind: 'split', tabId: 'b', groupId: 'g1', direction: 'right' }
    })
    expect(mocks.setState).toHaveBeenCalledOnce()
    expect(state.groupsByWorktree.workspace.map((group) => group.tabOrder)).toEqual([['a'], ['b']])
    expect(state.activeWorktreeId).toBe('another-workspace')
    expect(respond).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({
          groups: expect.arrayContaining([expect.objectContaining({ groupId: 'new-group' })])
        })
      })
    )
  })
})
