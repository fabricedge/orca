import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag } from '../flags'
import { getRequiredWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import { WORKSPACE_LAYOUT_INSPECTION_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import type { WorkspaceTabLayoutDescription } from '../../shared/workspace-tab-location'

export function parseOrcaTabId(value: string): string {
  const id = value
    .trim()
    .replace(/^orcaTabId:\s*/, '')
    .trim()
  if (!id) {
    throw new RuntimeClientError('invalid_argument', 'Missing tab ID.')
  }
  return id
}

async function assertLayoutSupport(ctx: HandlerContext): Promise<void> {
  const status = await ctx.client.getCliStatus()
  if (!status.result.runtime.reachable) {
    throw new RuntimeClientError('runtime_unavailable', 'The Orca execution host is unavailable.')
  }
  if (
    !status.result.runtime.capabilities?.includes(WORKSPACE_LAYOUT_INSPECTION_RUNTIME_CAPABILITY)
  ) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host does not support tab layout inspection. Update Orca on the host.'
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

const show: CommandHandler = async (ctx) => {
  const selected = getOptionalStringFlag(ctx.flags, 'tab')
  const tabId = selected === undefined ? undefined : parseOrcaTabId(selected)
  await assertLayoutSupport(ctx)
  const result = await readLayout(ctx, await workspaceSelector(ctx))
  if (tabId !== undefined) {
    result.result = {
      ...result.result,
      tabs: result.result.tabs.filter((tab) => tab.tabId === tabId)
    }
    if (!result.result.tabs.length) {
      throw new RuntimeClientError('tab_not_found', 'That tab ID is not in this workspace.')
    }
  }
  printResult(result, ctx.json, formatLayout)
}

export const LAYOUT_HANDLERS: Record<string, CommandHandler> = { 'layout show': show }
