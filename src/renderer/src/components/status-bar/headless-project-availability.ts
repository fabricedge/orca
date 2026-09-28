import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Project, ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'

export type HeadlessProjectAvailability = {
  onThisPc: string[]
  notReadyHere: string[]
}

/** The paired runtime owns these rows. A ready local setup or local repo proves registration here. */
export function getHeadlessProjectAvailability(
  projects: readonly Project[],
  setups: readonly ProjectHostSetup[],
  repos: readonly Repo[]
): HeadlessProjectAvailability {
  const localRepoIds = new Set(
    repos.filter((repo) => getRepoExecutionHostId(repo) === 'local').map((repo) => repo.id)
  )
  const readyProjectIds = new Set(
    setups
      .filter((setup) => setup.hostId === 'local' && setup.setupState === 'ready')
      .map((setup) => setup.projectId)
  )
  const onThisPc: string[] = []
  const notReadyHere: string[] = []
  for (const project of projects) {
    const available =
      readyProjectIds.has(project.id) ||
      (Array.isArray(project.sourceRepoIds) &&
        project.sourceRepoIds.some((repoId) => localRepoIds.has(repoId)))
    if (available) {
      onThisPc.push(project.displayName)
    } else {
      notReadyHere.push(project.displayName)
    }
  }
  return { onThisPc, notReadyHere }
}
