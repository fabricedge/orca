import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { LAYOUT_HANDLERS, parseOrcaTabId } from './layout'
import { WORKSPACE_LAYOUT_INSPECTION_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
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
        capabilities: [WORKSPACE_LAYOUT_INSPECTION_RUNTIME_CAPABILITY]
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
  it('rejects blank copied IDs before contacting the host', async () => {
    const { call, status, context } = setup()
    context.flags.set('tab', 'orcaTabId: ')
    await expect(LAYOUT_HANDLERS['layout show'](context)).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })
  it('reports a missing tab instead of falling back to the focused tab', async () => {
    const { call, context } = setup()
    context.flags.set('tab', 'missing')
    call.mockResolvedValue({
      id: 'layout',
      ok: true,
      result: layout,
      _meta: { runtimeId: 'runtime-1' }
    })
    await expect(LAYOUT_HANDLERS['layout show'](context)).rejects.toMatchObject({
      code: 'tab_not_found'
    })
    expect(layout.tabs).toHaveLength(1)
  })
  it('registers only read-only inspection', () => {
    expect(Object.keys(LAYOUT_HANDLERS)).toEqual(['layout show'])
  })
})
