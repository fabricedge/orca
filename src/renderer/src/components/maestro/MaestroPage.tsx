import React from 'react'
import { CheckCircle2, Loader2, Play, RefreshCw, Route, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { MaestroEvent, MaestroMissionSummary } from '../../../../shared/maestro-types'

type BusyAction = 'create' | 'refresh' | 'plan' | 'run' | null

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'text-primary',
  FAILED: 'text-destructive',
  RUNNING: 'text-primary',
  PLANNING: 'text-primary',
  WAITING: 'text-muted-foreground',
  CANCELLED: 'text-muted-foreground',
  PENDING: 'text-muted-foreground'
}

function statusClass(status: string): string {
  return STATUS_CLASS[status] ?? 'text-muted-foreground'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function MaestroPage(): React.JSX.Element {
  const [project, setProject] = React.useState('my-ecom')
  const [squad, setSquad] = React.useState('')
  const [objective, setObjective] = React.useState('')
  const [missions, setMissions] = React.useState<MaestroMissionSummary[]>([])
  const [selectedMissionId, setSelectedMissionId] = React.useState<string | null>(null)
  const [events, setEvents] = React.useState<MaestroEvent[]>([])
  const [busy, setBusy] = React.useState<BusyAction>(null)
  const [error, setError] = React.useState<string | null>(null)

  const selectedMission =
    missions.find((mission) => mission.id === selectedMissionId) ?? missions[0] ?? null

  const refresh = React.useCallback(
    async (nextSelectedId?: string | null) => {
      setBusy((current) => current ?? 'refresh')
      setError(null)
      try {
        const nextMissions = await window.api.maestro.listMissions({ project, limit: 50 })
        const missionId = nextSelectedId ?? selectedMissionId ?? nextMissions[0]?.id ?? null
        setMissions(nextMissions)
        setSelectedMissionId(missionId)
        if (missionId) {
          setEvents(await window.api.maestro.getEvents({ missionId }))
        } else {
          setEvents([])
        }
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [project, selectedMissionId]
  )

  React.useEffect(() => {
    void refresh(null)
  }, [refresh])

  const runAction = async (
    action: Exclude<BusyAction, null>,
    task: () => Promise<MaestroMissionSummary>
  ): Promise<void> => {
    setBusy(action)
    setError(null)
    try {
      const mission = await task()
      await refresh(mission.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const createMission = (): void => {
    void runAction('create', () =>
      window.api.maestro.createMission({
        project,
        objective,
        squad: squad.trim() || undefined
      })
    )
  }

  const planMission = (): void => {
    if (!selectedMission) {
      return
    }
    void runAction('plan', () => window.api.maestro.planMission({ missionId: selectedMission.id }))
  }

  const runMission = (): void => {
    if (!selectedMission) {
      return
    }
    void runAction('run', () => window.api.maestro.runMission({ missionId: selectedMission.id }))
  }

  const canCreate = project.trim() && objective.trim() && !busy
  const working = busy !== null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Maestro</h1>
          <p className="truncate text-xs text-muted-foreground">
            Prompt missions backed by the local Ollama orchestrator
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={working}
        >
          {busy === 'refresh' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Refresh
        </Button>
      </div>
      {error ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="space-y-3 border-b border-border p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="maestro-project">Project</Label>
                <Input
                  id="maestro-project"
                  value={project}
                  onChange={(event) => setProject(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maestro-squad">Squad</Label>
                <Input
                  id="maestro-squad"
                  placeholder="quick-fix"
                  value={squad}
                  onChange={(event) => setSquad(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="maestro-objective">Objective</Label>
              <Textarea
                id="maestro-objective"
                className="min-h-24 resize-none"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={createMission}
              disabled={!canCreate}
            >
              {busy === 'create' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              Create mission
            </Button>
          </div>
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto p-2">
            {missions.map((mission) => (
              <button
                key={mission.id}
                type="button"
                onClick={() => {
                  setSelectedMissionId(mission.id)
                  void window.api.maestro
                    .getEvents({ missionId: mission.id })
                    .then(setEvents, (err) => {
                      setError(errorMessage(err))
                    })
                }}
                className={cn(
                  'mb-1 w-full rounded-md px-2 py-2 text-left text-xs transition-colors',
                  selectedMission?.id === mission.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{mission.objective}</span>
                  <span
                    className={cn(
                      'shrink-0 text-[10px] font-semibold',
                      statusClass(mission.status)
                    )}
                  >
                    {mission.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-muted-foreground">{mission.id}</div>
              </button>
            ))}
          </div>
        </aside>
        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {selectedMission?.objective ?? 'No mission selected'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {selectedMission
                  ? `${selectedMission.project} / ${selectedMission.squad ?? 'default squad'}`
                  : project}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={planMission}
                disabled={!selectedMission || working}
              >
                {busy === 'plan' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Route className="size-4" />
                )}
                Plan
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={runMission}
                disabled={!selectedMission || working}
              >
                {busy === 'run' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run
              </Button>
            </div>
          </div>
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_360px]">
            <section className="scrollbar-sleek min-h-0 overflow-auto p-4">
              <div className="space-y-2">
                {(selectedMission?.tasks ?? []).map((task) => (
                  <div key={task.id} className="rounded-md border border-border p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate font-medium">{task.title}</div>
                      <div className={cn('shrink-0 font-semibold', statusClass(task.status))}>
                        {task.status}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 text-muted-foreground">
                      <div>Executor: {task.executor ?? 'unassigned'}</div>
                      {task.prompt_file ? (
                        <div className="truncate">Prompt: {task.prompt_file}</div>
                      ) : null}
                      {task.run_file ? <div className="truncate">Run: {task.run_file}</div> : null}
                      {task.error ? (
                        <div className="text-destructive">Error: {task.error}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {selectedMission && selectedMission.tasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Plan this mission to create the prompt task graph.
                  </div>
                ) : null}
              </div>
            </section>
            <section className="scrollbar-sleek min-h-0 overflow-auto border-l border-border p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
                <CheckCircle2 className="size-4" />
                Events
              </div>
              <div className="space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="border-b border-border pb-2 text-xs">
                    <div className="font-medium">{event.type}</div>
                    <div className="text-muted-foreground">{event.message}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{event.ts}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
