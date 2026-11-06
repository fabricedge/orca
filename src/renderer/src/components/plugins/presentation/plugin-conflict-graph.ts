import type { PluginHostListEntry } from '../../../../../preload/api-types'

export type PluginConflict = {
  left: PluginHostListEntry
  right: PluginHostListEntry
  reasons: string[]
}

function normalizedBinding(binding: string): string {
  return binding.trim().toLocaleLowerCase().replace(/\s+/g, '')
}

function editorExtensions(plugin: PluginHostListEntry): Set<string> {
  return new Set(
    (plugin.customEditors ?? [])
      .flatMap((editor) =>
        editor.extensions.map((extension) => extension.trim().toLocaleLowerCase())
      )
      .filter(Boolean)
  )
}

/** Declared plugin overlaps Orca can verify from installed metadata. */
export function findPluginConflicts(plugins: readonly PluginHostListEntry[]): PluginConflict[] {
  const conflicts: PluginConflict[] = []
  for (let leftIndex = 0; leftIndex < plugins.length; leftIndex += 1) {
    const left = plugins[leftIndex]
    if (!left) {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < plugins.length; rightIndex += 1) {
      const right = plugins[rightIndex]
      if (!right) {
        continue
      }
      const reasons = new Set<string>()
      const rightBindings = new Set(
        right.commands.flatMap((command) =>
          command.keybindings.map((item) => normalizedBinding(item.key))
        )
      )
      if (
        left.commands.some((command) =>
          command.keybindings.some((item) => rightBindings.has(normalizedBinding(item.key)))
        )
      ) {
        reasons.add('Same keyboard shortcut')
      }
      const rightExtensions = editorExtensions(right)
      const overlap = [...editorExtensions(left)].filter((extension) =>
        rightExtensions.has(extension)
      )
      if (overlap.length > 0) {
        reasons.add(`Both open ${overlap.map((item) => `*${item}`).join(', ')}`)
      }
      if (reasons.size > 0) {
        conflicts.push({ left, right, reasons: [...reasons] })
      }
    }
  }
  return conflicts
}
