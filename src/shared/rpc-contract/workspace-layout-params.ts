import { z } from 'zod'
import { WorktreeTabSelector } from './session-tabs-schemas-params'

const Id = z.string().min(1).max(4096)
export const WorkspaceLayoutAction = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('move'),
      tabId: Id,
      groupId: Id,
      index: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      kind: z.literal('split'),
      tabId: Id,
      groupId: Id,
      direction: z.enum(['left', 'right', 'up', 'down'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('grid-2x2'),
      tabIds: z
        .array(Id)
        .length(4)
        .refine((ids) => new Set(ids).size === 4, 'Select four distinct tabs')
    })
    .strict()
])
export const WorkspaceLayoutShow = WorktreeTabSelector
export const WorkspaceLayoutChange = WorktreeTabSelector.extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  action: WorkspaceLayoutAction
}).strict()

export const WorkspaceLayoutChrome = WorktreeTabSelector.extend({
  left: z.enum(['show', 'hide', 'toggle']).optional(),
  right: z.enum(['show', 'hide', 'toggle']).optional(),
  dryRun: z.boolean().optional()
}).strict()
