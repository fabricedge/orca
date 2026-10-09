import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const LAYOUT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['layout', 'chrome'],
    summary: 'Inspect or change left and right sidebar visibility',
    usage:
      'orca layout chrome [--worktree <selector>] [--left show|hide|toggle] [--right show|hide|toggle] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'left', 'right', 'dry-run'],
    notes: [
      'No visibility flags reads current state. Requires a desktop owner with the target workspace active. Widths and selected sections are preserved; closing the right sidebar dismisses its temporary visual, as with the UI close control. Prefer show/hide for predictable agent calls.'
    ]
  },
  {
    path: ['layout', 'show'],
    summary: 'Show saved tab IDs and the current workspace layout',
    usage: 'orca layout show [--worktree <selector>] [--tab <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'tab'],
    notes: [
      'Accepts a raw tab ID or copied "orcaTabId: <id>" text. Positions count from zero within each group. Bounds are normalized workspace coordinates, not pixels. availability distinguishes an open layout from saved session records.'
    ]
  },
  {
    path: ['layout', 'self'],
    summary: 'Locate the tab containing this agent',
    usage: 'orca layout self [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses this process’s Orca terminal or agent-session identity, never the currently focused tab.'
    ]
  },
  {
    path: ['layout', 'move'],
    summary: 'Move a tab to a group or reorder it',
    usage:
      'orca layout move [--worktree <selector>] --tab <id> --group <id> --index <n> [--expected-revision <revision>] [--dry-run] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'tab',
      'group',
      'index',
      'expected-revision',
      'dry-run'
    ]
  },
  {
    path: ['layout', 'split'],
    summary: 'Move an existing tab into an adjacent split group',
    usage:
      'orca layout split [--worktree <selector>] --tab <id> --group <id> --direction left|right|up|down [--expected-revision <revision>] [--dry-run] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'worktree',
      'tab',
      'group',
      'direction',
      'expected-revision',
      'dry-run'
    ],
    notes: ['Splits workspace tab groups. This does not create or split a terminal process.']
  },
  {
    path: ['layout', 'arrange'],
    summary: 'Arrange four existing tabs into a 2×2 grid',
    usage:
      'orca layout arrange [--worktree <selector>] --preset grid-2x2 --tabs <a,b,c,d> [--expected-revision <revision>] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'preset', 'tabs', 'expected-revision', 'dry-run'],
    notes: [
      'Tab order is top-left, top-right, bottom-left, bottom-right. A JSON array is also accepted for IDs containing commas. Other tabs keep their groups; the grid is placed to their right. Requires an available desktop layout owner. No processes are started or stopped.'
    ]
  }
]
