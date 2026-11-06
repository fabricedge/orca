import { AlertTriangle, Puzzle } from 'lucide-react'
import type { PluginHostListEntry } from '../../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { findPluginConflicts } from '../presentation/plugin-conflict-graph'

export function PluginConflictMap({
  plugins,
  onOpen
}: {
  plugins: readonly PluginHostListEntry[]
  onOpen: (pluginKey: string) => void
}): React.JSX.Element | null {
  const conflicts = findPluginConflicts(plugins)
  if (plugins.length < 2) {
    return null
  }

  return (
    <section
      aria-labelledby="plugin-conflict-map-title"
      className="mb-5 rounded-xl border border-border bg-card/50"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
        <div>
          <h3 id="plugin-conflict-map-title" className="text-sm font-medium">
            {translate('auto.components.plugins.PluginConflictMap.title', 'Plugin connections')}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {translate(
              'auto.components.plugins.PluginConflictMap.subtitle',
              'Declared overlaps between installed plugins'
            )}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {translate('auto.components.plugins.PluginConflictMap.count', '{{value0}} connections', {
            value0: conflicts.length
          })}
        </span>
      </header>
      {conflicts.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-muted-foreground">
          {translate(
            'auto.components.plugins.PluginConflictMap.empty',
            'No declared shortcut or file editor overlaps found.'
          )}
        </p>
      ) : (
        <ol className="space-y-2 p-3.5">
          {conflicts.map(({ left, right, reasons }) => (
            <li
              key={`${left.pluginKey}:${right.pluginKey}`}
              className="flex flex-col items-stretch gap-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(7rem,0.8fr)_minmax(0,1fr)] md:items-center"
            >
              <PluginNode plugin={left} onOpen={onOpen} />
              <div className="relative flex min-h-12 flex-col items-center justify-center gap-1 px-1 text-center">
                <span
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 left-1/2 border-l border-status-warning-text/50 md:top-1/2 md:right-0 md:bottom-auto md:left-0 md:border-t md:border-l-0"
                />
                <span className="relative flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-center text-2xs text-status-warning-text">
                  <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                  <span>{reasons.join(' · ')}</span>
                </span>
              </div>
              <PluginNode plugin={right} onOpen={onOpen} />
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-border px-3.5 py-2 text-2xs text-muted-foreground">
        {translate(
          'auto.components.plugins.PluginConflictMap.limit',
          'This map checks declared shortcuts and custom editor file types; it cannot predict arbitrary plugin code interactions.'
        )}
      </p>
    </section>
  )
}

function PluginNode({
  plugin,
  onOpen
}: {
  plugin: PluginHostListEntry
  onOpen: (pluginKey: string) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(plugin.pluginKey)}
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{plugin.name}</span>
        <span className="block truncate text-2xs text-muted-foreground">{plugin.pluginKey}</span>
      </span>
    </button>
  )
}
