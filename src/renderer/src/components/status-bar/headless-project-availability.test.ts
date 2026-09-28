import { describe, expect, it } from 'vitest'
import type { Project, ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import { getHeadlessProjectAvailability } from './headless-project-availability'

const project = (id: string, sourceRepoIds: string[] = []): Project =>
  ({ id, displayName: id, sourceRepoIds }) as Project
const setup = (
  projectId: string,
  hostId: ProjectHostSetup['hostId'],
  setupState: ProjectHostSetup['setupState']
): ProjectHostSetup => ({ projectId, hostId, setupState }) as ProjectHostSetup
const repo = (id: string, connectionId: string | null): Repo => ({ id, connectionId }) as Repo

describe('headless project availability', () => {
  it('uses live local registrations and separates projects with only remote or unfinished setups', () => {
    expect(
      getHeadlessProjectAvailability(
        [
          project('local setup'),
          project('local repo', ['repo-local']),
          project('ssh only', ['repo-ssh']),
          project('unfinished'),
          project('no setup')
        ],
        [
          setup('local setup', 'local', 'ready'),
          setup('ssh only', 'ssh:server', 'ready'),
          setup('unfinished', 'local', 'setting-up')
        ],
        [repo('repo-local', null), repo('repo-ssh', 'server')]
      )
    ).toEqual({
      onThisPc: ['local setup', 'local repo'],
      notReadyHere: ['ssh only', 'unfinished', 'no setup']
    })
  })
})
