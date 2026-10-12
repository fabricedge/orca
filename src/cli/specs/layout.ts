import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const LAYOUT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['layout', 'show'],
    summary: 'Inspect tab IDs, order and workspace layout',
    usage: 'orca layout show [--worktree <selector>] [--tab <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab'],
    notes: [
      'Accepts a raw tab ID or copied "orcaTabId: <id>" text. Positions count from zero within each group. Bounds are normalized workspace coordinates, not pixels. availability distinguishes an open layout from saved session records. Remote calls require --worktree. This command never moves tabs or changes sidebars.'
    ]
  }
]
