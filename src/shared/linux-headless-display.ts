import { access } from 'node:fs/promises'
import { runProcess } from './child-process/run-process'

export async function ensureLinuxHeadlessDisplay(): Promise<void> {
  if (
    await access('/usr/bin/Xvfb').then(
      () => true,
      () => false
    )
  ) {
    return
  }
  const packageManager = await access('/usr/bin/dnf').then(
    () => ({ program: '/usr/bin/dnf', args: ['install', '-y', 'xorg-x11-server-Xvfb'] }),
    async () =>
      await access('/usr/bin/apt-get').then(
        () => ({ program: '/usr/bin/apt-get', args: ['install', '-y', 'xvfb'] }),
        () => null
      )
  )
  if (!packageManager) {
    throw new Error('Install Xvfb with your Linux package manager, then retry in Orca.')
  }
  if (packageManager.program === '/usr/bin/apt-get') {
    const update = await runProcess({
      program: '/usr/bin/pkexec',
      args: ['/usr/bin/apt-get', 'update'],
      timeoutMs: 300_000
    })
    if (update.code !== 0) {
      throw new Error(update.stderr.trim() || 'Could not update package indexes for Xvfb.')
    }
  }
  const result = await runProcess({
    program: '/usr/bin/pkexec',
    args: [packageManager.program, ...packageManager.args],
    timeoutMs: 300_000
  })
  if (
    result.code !== 0 ||
    !(await access('/usr/bin/Xvfb').then(
      () => true,
      () => false
    ))
  ) {
    throw new Error(result.stderr.trim() || 'Xvfb installation did not complete.')
  }
}
