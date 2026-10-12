import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceTabTopology } from '../../../../shared/workspace-tab-location'
import type { WorkspaceTabLayoutRequest } from '../../../../shared/workspace-tab-layout-inspection'
import { registerWorkspaceLayoutIpcBridge } from './workspace-layout-ipc-bridge'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: mocks }))

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

  it('rejects expired requests without reading or changing the layout', () => {
    const { send, respond } = setup()
    send({ expiresAt: 0 })
    expect(respond).toHaveBeenLastCalledWith({ requestId: 'req', error: 'layout_request_expired' })
    expect(mocks.setState).not.toHaveBeenCalled()
  })
  it('returns an empty loaded workspace as open', () => {
    const { state, send, respond } = setup()
    state.unifiedTabsByWorktree.workspace = []
    send()
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({ availability: 'open', tabs: [] })
      })
    )
  })
})
