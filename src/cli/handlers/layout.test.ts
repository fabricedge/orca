import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { LAYOUT_HANDLERS, parseOrcaTabId } from './layout'
import {
  WORKSPACE_LAYOUT_RUNTIME_CAPABILITY,
  WORKSPACE_CHROME_RUNTIME_CAPABILITY
} from '../../shared/protocol-version'
import { describeWorkspaceTabLayout } from '../../shared/workspace-tab-location'

const layout = describeWorkspaceTabLayout(
  'workspace-1',
  {
    tabs: [
      {
        id: 'tab-1',
        entityId: 'terminal-1',
        groupId: 'g1',
        worktreeId: 'workspace-1',
        contentType: 'terminal',
        label: 'shell',
        customLabel: null,
        color: null,
        sortOrder: 0,
        createdAt: 0
      }
    ],
    groups: [{ id: 'g1', worktreeId: 'workspace-1', tabOrder: ['tab-1'], activeTabId: 'tab-1' }],
    layout: { type: 'leaf', groupId: 'g1' },
    activeGroupId: 'g1'
  },
  'open',
  true
)

function setup() {
  const client = new RuntimeClient('/tmp/orca-layout-cli-tests', 1000, null, null)
  const call = vi.spyOn(client, 'call')
  const status = vi.spyOn(client, 'getCliStatus').mockResolvedValue({
    id: 'status',
    ok: true,
    _meta: { runtimeId: 'runtime-1' },
    result: {
      app: { running: true, pid: 123 },
      runtime: {
        state: 'ready',
        reachable: true,
        runtimeId: 'runtime-1',
        capabilities: [WORKSPACE_LAYOUT_RUNTIME_CAPABILITY]
      },
      graph: { state: 'ready' }
    }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const context = {
    client,
    cwd: '/tmp/orca-layout-cli-tests',
    flags: new Map<string, string | boolean>([['worktree', 'id:workspace-1']]),
    json: true
  }
  return { call, status, log, context }
}

beforeEach(() => {
  vi.stubEnv('ORCA_WORKTREE_ID', '')
  vi.stubEnv('ORCA_PANE_KEY', '')
  vi.stubEnv('ORCA_TERMINAL_HANDLE', '')
  vi.stubEnv('ORCA_AGENT_SESSION_ID', '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('layout CLI', () => {
  it('rejects chrome controls on older hosts without issuing any RPC', async () => {
    const { call, context } = setup()
    context.flags.set('left', 'hide')
    await expect(LAYOUT_HANDLERS['layout chrome'](context)).rejects.toMatchObject({
      code: 'incompatible_runtime'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('sends both requested visibility states and dry-run to the owner', async () => {
    const { call, status, log, context } = setup()
    const response = await status()
    response.result.runtime.capabilities = [
      ...(response.result.runtime.capabilities ?? []),
      WORKSPACE_CHROME_RUNTIME_CAPABILITY
    ]
    status.mockResolvedValue(response)
    context.flags.set('left', 'hide')
    context.flags.set('right', 'show')
    context.flags.set('dry-run', true)
    const current = { left: { open: true, width: 300 }, right: { open: false, width: 400 } }
    call.mockResolvedValue({
      id: 'chrome',
      ok: true,
      result: {
        workspaceId: 'workspace-1',
        dryRun: true,
        current,
        proposed: { left: { open: false, width: 300 }, right: { open: true, width: 400 } }
      },
      _meta: { runtimeId: 'runtime-1' }
    })
    await LAYOUT_HANDLERS['layout chrome'](context)
    expect(call).toHaveBeenCalledExactlyOnceWith('workspace.layout.chrome', {
      worktree: 'id:workspace-1',
      left: 'hide',
      right: 'show',
      dryRun: true
    })
    expect(JSON.parse(String(log.mock.calls[0][0])).result.dryRun).toBe(true)
  })

  it('rejects invalid visibility before contacting a host', async () => {
    const { call, status, context } = setup()
    context.flags.set('left', 'dismiss')
    await expect(LAYOUT_HANDLERS['layout chrome'](context)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })

  it('accepts copied labels and raw IDs', () => {
    expect(parseOrcaTabId('orcaTabId: tab-1')).toBe('tab-1')
    expect(parseOrcaTabId('tab-1')).toBe('tab-1')
    expect(() => parseOrcaTabId('orcaTabId: ')).toThrow('Missing tab ID')
  })

  it('looks up a copied workspace ID and preserves the full group context', async () => {
    const { call, log, context } = setup()
    context.flags.set('tab', 'orcaTabId: tab-1')
    call.mockResolvedValue({
      id: 'layout',
      ok: true,
      result: structuredClone(layout),
      _meta: { runtimeId: 'runtime-1' }
    })
    await LAYOUT_HANDLERS['layout show'](context)
    expect(call).toHaveBeenCalledExactlyOnceWith('workspace.layout.show', {
      worktree: 'id:workspace-1'
    })
    expect(JSON.parse(String(log.mock.calls[0][0])).result).toMatchObject({
      workspaceId: 'workspace-1',
      tabs: [{ tabId: 'tab-1', position: 0 }]
    })
  })

  it('sends the observed revision with a move and returns the host result', async () => {
    const { call, context } = setup()
    context.flags.set('tab', 'orcaTabId: tab-1')
    context.flags.set('group', 'g1')
    context.flags.set('index', '0')
    call.mockResolvedValue({
      id: 'layout',
      ok: true,
      result: layout,
      _meta: { runtimeId: 'runtime-1' }
    })
    await LAYOUT_HANDLERS['layout move'](context)
    expect(call).toHaveBeenLastCalledWith('workspace.layout.change', {
      worktree: 'id:workspace-1',
      expectedRevision: layout.revision,
      action: { kind: 'move', tabId: 'tab-1', groupId: 'g1', index: 0 }
    })
  })

  it('previews a split without issuing a mutation or changing the snapshot', async () => {
    const { call, log, context } = setup()
    const snapshot = structuredClone(layout)
    snapshot.tabs.push({
      ...snapshot.tabs[0],
      tabId: 'tab-2',
      contentId: 'terminal-2',
      position: 1,
      isDisplayed: false
    })
    snapshot.groups[0].tabOrder.push('tab-2')
    const original = structuredClone(snapshot)
    context.flags.set('tab', 'tab-2')
    context.flags.set('group', 'g1')
    context.flags.set('direction', 'right')
    context.flags.set('dry-run', true)
    call.mockResolvedValue({
      id: 'layout',
      ok: true,
      result: snapshot,
      _meta: { runtimeId: 'runtime-1' }
    })
    await LAYOUT_HANDLERS['layout split'](context)
    expect(call).toHaveBeenCalledExactlyOnceWith('workspace.layout.show', {
      worktree: 'id:workspace-1'
    })
    expect(snapshot).toEqual(original)
    expect(JSON.parse(String(log.mock.calls[0][0])).result).toMatchObject({
      dryRun: true,
      basedOnRevision: layout.revision,
      changedTabs: [
        expect.objectContaining({ tabId: 'tab-1' }),
        expect.objectContaining({ tabId: 'tab-2' })
      ]
    })
  })

  it('rejects an outdated preview without issuing a mutation', async () => {
    const { call, context } = setup()
    context.flags.set('tab', 'tab-1')
    context.flags.set('group', 'g1')
    context.flags.set('index', '0')
    context.flags.set('dry-run', true)
    context.flags.set('expected-revision', 'old')
    call.mockResolvedValue({
      id: 'layout',
      ok: true,
      result: layout,
      _meta: { runtimeId: 'runtime-1' }
    })
    await expect(LAYOUT_HANDLERS['layout move'](context)).rejects.toMatchObject({
      code: 'stale_workspace_layout'
    })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('refuses an older host before any layout request', async () => {
    const { call, status, context } = setup()
    const response = await status()
    response.result.runtime.capabilities = []
    status.mockResolvedValue(response)
    await expect(LAYOUT_HANDLERS['layout show'](context)).rejects.toMatchObject({
      code: 'incompatible_runtime'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('never guesses that the focused tab belongs to the caller', async () => {
    const { call, context } = setup()
    await expect(LAYOUT_HANDLERS['layout self'](context)).rejects.toMatchObject({
      code: 'agent_location_unavailable'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('resolves its pane on the host and maps the content ID to the workspace ID', async () => {
    const { call, log, context } = setup()
    vi.stubEnv('ORCA_PANE_KEY', 'terminal-1:leaf-1')
    call.mockResolvedValueOnce({
      id: 'pane',
      ok: true,
      result: { terminal: { tabId: 'terminal-1', worktreeId: 'workspace-1' } },
      _meta: { runtimeId: 'runtime-1' }
    })
    call.mockResolvedValueOnce({
      id: 'layout',
      ok: true,
      result: layout,
      _meta: { runtimeId: 'runtime-1' }
    })
    await LAYOUT_HANDLERS['layout self'](context)
    expect(call).toHaveBeenNthCalledWith(1, 'terminal.resolvePane', {
      paneKey: 'terminal-1:leaf-1'
    })
    expect(JSON.parse(String(log.mock.calls[0][0])).result.self.tabId).toBe('tab-1')
  })

  it('rejects duplicate grid selections before contacting the host', async () => {
    const { call, context } = setup()
    context.flags.set('preset', 'grid-2x2')
    context.flags.set('tabs', 'a,a,b,c')
    await expect(LAYOUT_HANDLERS['layout arrange'](context)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
  })
})
