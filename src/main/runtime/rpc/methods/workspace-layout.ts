import { defineMethod } from '../core'
import {
  WorkspaceLayoutChrome,
  WorkspaceLayoutShow,
  WorkspaceLayoutChange
} from '../../../../shared/rpc-contract/workspace-layout-params'

export const WORKSPACE_LAYOUT_METHODS = [
  defineMethod({
    name: 'workspace.layout.chrome',
    permission: 'workspace',
    params: WorkspaceLayoutChrome,
    handler: (params, { runtime }) =>
      runtime.workspaceLayoutChrome(params.worktree, {
        left: params.left,
        right: params.right,
        dryRun: params.dryRun
      })
  }),
  defineMethod({
    name: 'workspace.layout.show',
    permission: 'workspace',
    params: WorkspaceLayoutShow,
    handler: (params, { runtime }) => runtime.workspaceTabLayout(params.worktree)
  }),
  defineMethod({
    name: 'workspace.layout.change',
    permission: 'workspace',
    params: WorkspaceLayoutChange,
    handler: (params, { runtime }) =>
      runtime.workspaceTabLayout(params.worktree, {
        expectedRevision: params.expectedRevision,
        action: params.action
      })
  })
]
