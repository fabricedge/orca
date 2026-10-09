import type { SidebarVisibility, WorkspaceChromeResult } from '../../shared/workspace-layout-chrome'
import { previewWorkspaceLayout } from './layout-preview'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { getRequiredWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import {
  WORKSPACE_LAYOUT_RUNTIME_CAPABILITY,
  WORKSPACE_CHROME_RUNTIME_CAPABILITY
} from '../../shared/protocol-version'
import type {
  WorkspaceTabLayoutAction,
  WorkspaceTabLayoutDescription
} from '../../shared/workspace-tab-location'
import {
  readInjectedAgentSessionId,
  injectedSessionAddress
} from '../../shared/agent-session-caller-env'
import type { OrchestrationPartyLocationResult } from '../../shared/orchestration-caller-status'

export function parseOrcaTabId(value: string): string {
  const id = value.replace(/^orcaTabId:\s*/, '').trim()
  if (!id) {
    throw new RuntimeClientError('invalid_argument', 'Missing tab ID.')
  }
  return id
}

async function assertLayoutSupport(
  ctx: HandlerContext,
  capability: string = WORKSPACE_LAYOUT_RUNTIME_CAPABILITY
): Promise<void> {
  const status = await ctx.client.getCliStatus()
  if (!status.result.runtime.reachable) {
    throw new RuntimeClientError('runtime_unavailable', 'The Orca execution host is unavailable.')
  }
  if (!status.result.runtime.capabilities?.includes(capability)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host does not support tab layout inspection and control. Update Orca on the host.'
    )
  }
}

async function workspaceSelector(ctx: HandlerContext): Promise<string> {
  if (ctx.flags.has('worktree')) {
    return getRequiredWorktreeSelector(ctx.flags, 'worktree', ctx.cwd, ctx.client)
  }
  if (ctx.client.isRemote) {
    throw new RuntimeClientError('invalid_argument', 'Remote layout commands require --worktree.')
  }
  if (process.env.ORCA_WORKTREE_ID) {
    return `id:${process.env.ORCA_WORKTREE_ID}`
  }
  return resolveCurrentWorktreeSelector(ctx.cwd, ctx.client)
}

async function readLayout(ctx: HandlerContext, worktree: string) {
  return ctx.client.call<WorkspaceTabLayoutDescription>('workspace.layout.show', { worktree })
}

function formatLayout(value: WorkspaceTabLayoutDescription): string {
  return [
    `Workspace: ${value.workspaceId} (${value.availability})`,
    ...value.tabs.map(
      (tab) =>
        `orcaTabId: ${tab.tabId}\t${tab.type}\tgroup: ${tab.groupId}\tposition: ${tab.position ?? 'unavailable'}\t${tab.title}`
    )
  ].join('\n')
}

async function changeLayout(ctx: HandlerContext, action: WorkspaceTabLayoutAction): Promise<void> {
  await assertLayoutSupport(ctx)
  const worktree = await workspaceSelector(ctx)
  const current = await readLayout(ctx, worktree)
  const expectedRevision =
    getOptionalStringFlag(ctx.flags, 'expected-revision') ?? current.result.revision
  if (ctx.flags.get('dry-run') === true) {
    if (expectedRevision !== current.result.revision) {
      throw new RuntimeClientError(
        'stale_workspace_layout',
        'Inspect the layout again before planning.'
      )
    }
    const preview = previewWorkspaceLayout(current.result, action)
    printResult({ ...current, result: preview }, ctx.json, (value) =>
      [
        'Preview only; no tabs were moved.',
        `Based on revision: ${value.basedOnRevision}`,
        ...value.changedTabs.map(
          (tab) =>
            `orcaTabId: ${tab.tabId}  ${tab.from.groupId}:${tab.from.position} -> ${tab.to.groupId}:${tab.to.position}`
        ),
        'New group IDs are provisional. Apply the same command without --dry-run and with --expected-revision above.'
      ].join('\n')
    )
    return
  }
  const result = await ctx.client.call<WorkspaceTabLayoutDescription>('workspace.layout.change', {
    worktree,
    expectedRevision,
    action
  })
  printResult(result, ctx.json, formatLayout)
}

const show: CommandHandler = async (ctx) => {
  await assertLayoutSupport(ctx)
  const result = await readLayout(ctx, await workspaceSelector(ctx))
  const selected = getOptionalStringFlag(ctx.flags, 'tab')
  if (selected) {
    result.result.tabs = result.result.tabs.filter((tab) => tab.tabId === parseOrcaTabId(selected))
    if (!result.result.tabs.length) {
      throw new RuntimeClientError('tab_not_found', 'That tab ID is not in this workspace.')
    }
  }
  printResult(result, ctx.json, formatLayout)
}

const self: CommandHandler = async (ctx) => {
  await assertLayoutSupport(ctx)
  let contentId: string
  let worktreeId: string
  if (readInjectedAgentSessionId()) {
    const response = await ctx.client.call<OrchestrationPartyLocationResult>(
      'orchestration.partyLocation',
      { address: injectedSessionAddress() }
    )
    if (response.result.location?.kind !== 'chat') {
      throw new RuntimeClientError(
        'agent_location_unavailable',
        'This agent session has no identifiable chat tab.'
      )
    }
    contentId = response.result.location.sessionId
    worktreeId = response.result.location.worktreeId
  } else {
    const paneKey = process.env.ORCA_PANE_KEY
    const handle = process.env.ORCA_TERMINAL_HANDLE
    if (!paneKey && !handle) {
      throw new RuntimeClientError(
        'agent_location_unavailable',
        'Run layout self inside an Orca agent or terminal. No caller tab identity is available.'
      )
    }
    const response = paneKey
      ? await ctx.client.call<{ terminal: { tabId: string; worktreeId?: string } }>(
          'terminal.resolvePane',
          { paneKey }
        )
      : await ctx.client.call<{ terminal: { tabId: string; worktreeId?: string } }>(
          'terminal.show',
          { terminal: handle }
        )
    contentId = response.result.terminal.tabId
    if (!response.result.terminal.worktreeId) {
      throw new RuntimeClientError(
        'agent_location_unavailable',
        'The host could not identify this terminal’s workspace.'
      )
    }
    worktreeId = response.result.terminal.worktreeId
  }
  const result = await readLayout(ctx, `id:${worktreeId}`)
  const matches = result.result.tabs.filter(
    (tab) => tab.contentId === contentId || tab.tabId === contentId
  )
  if (matches.length !== 1) {
    throw new RuntimeClientError(
      'agent_location_unavailable',
      'The host could not uniquely locate this agent’s tab.'
    )
  }
  printResult(
    { ...result, result: { ...result.result, self: matches[0] } },
    ctx.json,
    (value) => `orcaTabId: ${value.self.tabId}\n${formatLayout(value)}`
  )
}

function visibilityFlag(ctx: HandlerContext, name: string): SidebarVisibility | undefined {
  const value = getOptionalStringFlag(ctx.flags, name)
  if (value === undefined || value === 'show' || value === 'hide' || value === 'toggle') {
    return value
  }
  throw new RuntimeClientError('invalid_argument', `--${name} must be show, hide or toggle.`)
}

export const LAYOUT_HANDLERS: Record<string, CommandHandler> = {
  'layout chrome': async (ctx) => {
    const left = visibilityFlag(ctx, 'left')
    const right = visibilityFlag(ctx, 'right')
    await assertLayoutSupport(ctx, WORKSPACE_CHROME_RUNTIME_CAPABILITY)
    const result = await ctx.client.call<WorkspaceChromeResult>('workspace.layout.chrome', {
      worktree: await workspaceSelector(ctx),
      left,
      right,
      dryRun: ctx.flags.get('dry-run') === true
    })
    printResult(result, ctx.json, (value) =>
      [
        value.dryRun ? 'Preview only; sidebar visibility was not changed.' : 'Sidebar visibility:',
        `Left: ${value.proposed.left.open ? 'shown' : 'hidden'} (${value.proposed.left.width}px)`,
        `Right: ${value.proposed.right.open ? 'shown' : 'hidden'} (${value.proposed.right.width}px)`
      ].join('\n')
    )
  },
  'layout show': show,
  'layout self': self,
  'layout move': async (ctx) => {
    const index = Number(getRequiredStringFlag(ctx.flags, 'index'))
    if (!Number.isInteger(index) || index < 0) {
      throw new RuntimeClientError('invalid_argument', '--index must be a nonnegative integer.')
    }
    await changeLayout(ctx, {
      kind: 'move',
      tabId: parseOrcaTabId(getRequiredStringFlag(ctx.flags, 'tab')),
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      index
    })
  },
  'layout split': async (ctx) => {
    const direction = getRequiredStringFlag(ctx.flags, 'direction')
    if (
      direction !== 'left' &&
      direction !== 'right' &&
      direction !== 'up' &&
      direction !== 'down'
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--direction must be left, right, up, or down.'
      )
    }
    await changeLayout(ctx, {
      kind: 'split',
      tabId: parseOrcaTabId(getRequiredStringFlag(ctx.flags, 'tab')),
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      direction
    })
  },
  'layout arrange': async (ctx) => {
    if (getRequiredStringFlag(ctx.flags, 'preset') !== 'grid-2x2') {
      throw new RuntimeClientError('invalid_argument', 'Supported preset: grid-2x2.')
    }
    const value = getRequiredStringFlag(ctx.flags, 'tabs')
    const ids: unknown = value.startsWith('[') ? JSON.parse(value) : value.split(',')
    if (
      !Array.isArray(ids) ||
      ids.length !== 4 ||
      !ids.every((id): id is string => typeof id === 'string')
    ) {
      throw new RuntimeClientError('invalid_argument', '--tabs must contain four tab IDs.')
    }
    const tabIds = ids.map(parseOrcaTabId)
    if (new Set(tabIds).size !== 4) {
      throw new RuntimeClientError('invalid_argument', 'Select four distinct tabs.')
    }
    await changeLayout(ctx, { kind: 'grid-2x2', tabIds })
  }
}
