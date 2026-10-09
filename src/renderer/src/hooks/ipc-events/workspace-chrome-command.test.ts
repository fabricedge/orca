import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeWorkspaceChrome } from './workspace-chrome-command'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: mocks }))
afterEach(() => vi.clearAllMocks())

function setup() {
  const state = {
    activeWorktreeId: 'workspace',
    sidebarOpen: true,
    sidebarWidth: 300,
    rightSidebarOpen: true,
    rightSidebarWidth: 400,
    rightSidebarTab: 'checks',
    rightSidebarVisual: { file: 'temporary.html' },
    sidebarBody: 'agents'
  }
  mocks.getState.mockReturnValue(state)
  mocks.setState.mockImplementation((patch: object) => Object.assign(state, patch))
  return state
}

describe('workspace sidebar commands', () => {
  it('reads without writing and previews both panels without changing state', () => {
    const state = setup()
    const original = structuredClone(state)
    expect(executeWorkspaceChrome('workspace', {}).current.left.open).toBe(true)
    expect(
      executeWorkspaceChrome('workspace', { left: 'hide', right: 'hide', dryRun: true })
    ).toMatchObject({
      dryRun: true,
      current: { left: { open: true }, right: { open: true } },
      proposed: { left: { open: false }, right: { open: false } }
    })
    expect(state).toEqual(original)
    expect(mocks.setState).not.toHaveBeenCalled()
  })

  it('updates both sides atomically and preserves widths and sections', () => {
    const state = setup()
    executeWorkspaceChrome('workspace', { left: 'hide', right: 'hide' })
    expect(mocks.setState).toHaveBeenCalledOnce()
    expect(state).toMatchObject({
      sidebarOpen: false,
      rightSidebarOpen: false,
      sidebarWidth: 300,
      rightSidebarWidth: 400,
      rightSidebarTab: 'checks',
      sidebarBody: 'agents',
      rightSidebarVisual: null
    })
    executeWorkspaceChrome('workspace', { left: 'show', right: 'show' })
    expect(state).toMatchObject({
      sidebarOpen: true,
      rightSidebarOpen: true,
      rightSidebarTab: 'checks'
    })
  })

  it('keeps the other panel untouched and supports repeatable show/hide and toggle', () => {
    const state = setup()
    executeWorkspaceChrome('workspace', { left: 'hide' })
    executeWorkspaceChrome('workspace', { left: 'hide' })
    expect(state.rightSidebarVisual).not.toBeNull()
    expect(state.rightSidebarOpen).toBe(true)
    executeWorkspaceChrome('workspace', { left: 'toggle' })
    expect(state.sidebarOpen).toBe(true)
    executeWorkspaceChrome('workspace', { right: 'toggle' })
    expect(state.rightSidebarOpen).toBe(false)
    executeWorkspaceChrome('workspace', { right: 'show' })
    executeWorkspaceChrome('workspace', { right: 'show' })
    expect(state.rightSidebarOpen).toBe(true)
  })

  it('rejects inactive workspace requests without switching or writing', () => {
    const state = setup()
    expect(() => executeWorkspaceChrome('other', { left: 'hide' })).toThrow(
      'workspace_chrome_inactive_workspace'
    )
    expect(mocks.setState).not.toHaveBeenCalled()
    expect(state.activeWorktreeId).toBe('workspace')
  })
})
