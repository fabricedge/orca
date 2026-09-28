import { useEffect, useRef, useState } from 'react'
import { Server } from 'lucide-react'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { Project, ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import {
  getHeadlessProjectAvailability,
  type HeadlessProjectAvailability
} from './headless-project-availability'

export function HeadlessConnectionIndicator(): React.JSX.Element | null {
  const [status, setStatus] = useState<RuntimeStatus | null>(null)
  const [projects, setProjects] = useState<HeadlessProjectAvailability | null>(null)
  const [expanded, setExpanded] = useState(false)
  const lastCatalogRefresh = useRef(0)
  const catalogRuntimeId = useRef<string | null>(null)

  useEffect(() => {
    if (!isWebClientLocation()) {
      return
    }
    let mounted = true
    const refresh = async (): Promise<void> => {
      try {
        const result = await window.api.runtime.getStatus()
        if (!mounted) {
          return
        }
        setStatus(result)
        if (result.runtimeMode !== 'headless' || result.graphStatus !== 'ready') {
          catalogRuntimeId.current = null
          lastCatalogRefresh.current = 0
          setProjects(null)
          return
        }
        if (catalogRuntimeId.current !== result.runtimeId) {
          catalogRuntimeId.current = result.runtimeId
          lastCatalogRefresh.current = 0
          setProjects(null)
        }
        if (Date.now() - lastCatalogRefresh.current < 60_000) {
          return
        }
        lastCatalogRefresh.current = Date.now()
        const [projectResponse, setupResponse, repoResponse] = await Promise.all([
          window.api.runtime.call({ method: 'project.list' }),
          window.api.runtime.call({ method: 'projectHostSetup.list' }),
          window.api.runtime.call({ method: 'repo.list' })
        ])
        if (!mounted || catalogRuntimeId.current !== result.runtimeId) {
          return
        }
        const projectRows = projectResponse.ok
          ? (projectResponse.result as { projects?: unknown } | null)?.projects
          : null
        const setupRows = setupResponse.ok
          ? (setupResponse.result as { setups?: unknown } | null)?.setups
          : null
        const repoRows = repoResponse.ok
          ? (repoResponse.result as { repos?: unknown } | null)?.repos
          : null
        if (Array.isArray(projectRows) && Array.isArray(setupRows) && Array.isArray(repoRows)) {
          setProjects(
            getHeadlessProjectAvailability(
              projectRows as Project[],
              setupRows as ProjectHostSetup[],
              repoRows as Repo[]
            )
          )
        } else {
          lastCatalogRefresh.current = 0
          setProjects(null)
        }
      } catch {
        if (mounted) {
          catalogRuntimeId.current = null
          lastCatalogRefresh.current = 0
          setStatus(null)
          setProjects(null)
        }
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  if (!status || status.runtimeMode !== 'headless' || status.graphStatus !== 'ready') {
    return null
  }
  const projectLabel = projects
    ? `${projects.onThisPc.length} here${projects.notReadyHere.length ? ` · ${projects.notReadyHere.length} not ready here` : ''}`
    : 'Checking projects…'
  return (
    <div
      className={`fixed left-1/2 top-[max(0.25rem,env(safe-area-inset-top))] z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 border border-border/70 bg-background/95 text-[11px] text-muted-foreground shadow-sm backdrop-blur ${expanded ? 'w-80 rounded-xl' : 'rounded-full'}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`Headless server connected to ${status.hostName ?? 'this PC'}, ${projectLabel}. Show project connection details.`}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1"
      >
        <Server className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          Headless · {status.hostName ? `Connected to ${status.hostName}` : 'Connected'} ·{' '}
          {projectLabel}
        </span>
      </button>
      {expanded && (
        <div
          className="max-h-64 space-y-2 overflow-y-auto scrollbar-sleek px-3 pb-3 text-xs leading-relaxed"
          role="note"
        >
          <p>
            Live catalog from {status.hostName ?? 'the paired PC'}
            {status.profileName ? ` · Orca profile ${status.profileName}` : ''}. The server loaded
            this profile when it started.
          </p>
          {projects ? (
            <>
              <p className="font-medium text-foreground">Registered on this PC</p>
              {projects.onThisPc.length > 0 ? (
                <ul className="list-inside list-disc">
                  {projects.onThisPc.map((name, index) => (
                    <li key={`${name}-${index}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p>None yet.</p>
              )}
              {projects.notReadyHere.length > 0 && (
                <>
                  <p className="font-medium text-foreground">
                    Known projects without a ready setup here
                  </p>
                  <ul className="list-inside list-disc">
                    {projects.notReadyHere.map((name, index) => (
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p>Checking project availability…</p>
          )}
          <p>
            Other Orca hosts may have more projects. Their catalogs are separate and are not synced
            automatically.
          </p>
        </div>
      )}
    </div>
  )
}
