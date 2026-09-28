import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from './child-process/run-process'
import { ensureLinuxHeadlessDisplay } from './linux-headless-display'
import {
  captureHeadlessRollbackFailure,
  throwHeadlessMutationFailure,
  unlinkHeadlessServiceFileIfPresent
} from './linux-headless-service-rollback'
import type { LinuxHeadlessServiceSnapshot } from './linux-headless-service'
import { LINUX_HEADLESS_SERVICE_UNIT_EXISTS_ERROR } from './linux-headless-service'
import {
  getManagedLinuxHeadlessServiceSnapshot,
  LINUX_HEADLESS_UNIT_MARKER,
  LINUX_HEADLESS_UNIT_NAME,
  linuxHeadlessUnitDirectory,
  linuxHeadlessUnitPath
} from './linux-headless-service-state'

function assertSupportedLinuxUser(): void {
  if (process.platform !== 'linux' || process.getuid?.() === 0) {
    throw new Error('The headless service is available to non-root users on Linux.')
  }
}

export type LinuxHeadlessUnitOptions = {
  executable: string
  args?: string[]
  environment?: Record<string, string>
  port: number
  pairingAddress: string
}

export async function enableManagedLinuxHeadlessLinger(): Promise<void> {
  assertSupportedLinuxUser()
  const username = os.userInfo().username
  const current = await runProcess({
    program: '/usr/bin/loginctl',
    args: ['show-user', username, '--property=Linger', '--value'],
    timeoutMs: 5_000
  }).catch(() => null)
  if (current?.code === 0 && current.stdout.trim() === 'yes') {return}
  const result = await runProcess({
    program: '/usr/bin/pkexec',
    args: ['/usr/bin/loginctl', 'enable-linger', username],
    timeoutMs: 120_000
  }).catch((error: unknown) => {
    throw new Error(`Could not request administrator authorization: ${String(error)}`)
  })
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Administrator authorization was not completed.')
  }
}

async function systemctl(args: string[]): Promise<string> {
  const result = await runProcess({
    program: '/usr/bin/systemctl',
    args: ['--user', ...args],
    timeoutMs: 15_000
  })
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `systemctl ${args.join(' ')} failed (${result.code})`)
  }
  return result.stdout.trim()
}

async function isEnabledOrActive(action: 'is-enabled' | 'is-active'): Promise<boolean> {
  try {
    await systemctl([action, LINUX_HEADLESS_UNIT_NAME])
    return true
  } catch {
    return false
  }
}

function quote(value: string): string {
  return `"${value.replaceAll('%', '%%').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function validate(options: LinuxHeadlessUnitOptions): void {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('Choose a port between 1 and 65535.')
  }
  const address = options.pairingAddress.trim()
  if (
    !address ||
    (address !== 'auto' && (/[\r\n\0\s]/u.test(address) || address.startsWith('-')))
  ) {
    throw new Error('Enter a reachable hostname or IP address without spaces.')
  }
  if (!path.isAbsolute(options.executable)) {
    throw new Error('The Orca executable path must be absolute.')
  }
}

export function buildLinuxHeadlessUnit(options: LinuxHeadlessUnitOptions): string {
  validate(options)
  const command = [options.executable, ...(options.args ?? [])]
    .map((argument) => quote(argument).replaceAll('$', '$$'))
    .join(' ')
  const environment = Object.entries(options.environment ?? {}).map(
    ([key, value]) => `Environment=${quote(`${key}=${value}`).replaceAll('$', '$$')}`
  )
  return [
    LINUX_HEADLESS_UNIT_MARKER,
    '[Unit]',
    'Description=Orca headless runtime server',
    'StartLimitIntervalSec=300',
    'StartLimitBurst=5',
    '',
    '[Service]',
    'Type=simple',
    'Environment=LIBGL_ALWAYS_SOFTWARE=1',
    'Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin',
    ...environment,
    'UnsetEnvironment=DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS ELECTRON_RUN_AS_NODE ELECTRON_RENDERER_URL',
    `ExecStart=${command} --serve --serve-json --serve-port ${options.port} --serve-pairing-address ${quote(options.pairingAddress.trim()).replaceAll('$', '$$')}`,
    'Restart=on-failure',
    'RestartPreventExitStatus=3',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    ''
  ].join('\n')
}

export async function installManagedLinuxHeadlessService(
  options: LinuxHeadlessUnitOptions & { overwriteExisting?: boolean },
  ensurePrerequisites: () => Promise<void>
): Promise<LinuxHeadlessServiceSnapshot> {
  assertSupportedLinuxUser()
  validate(options)
  const nextUnit = buildLinuxHeadlessUnit(options)
  const existing = await readFile(linuxHeadlessUnitPath, 'utf8').catch(() => null)
  if (existing && !existing.startsWith(`${LINUX_HEADLESS_UNIT_MARKER}\n`)) {
    throw new Error(
      `The service at ${linuxHeadlessUnitPath} is not managed by Orca; it was left unchanged.`
    )
  }
  if (existing && !options.overwriteExisting) {
    throw new Error(
      `${LINUX_HEADLESS_SERVICE_UNIT_EXISTS_ERROR} ${linuxHeadlessUnitPath}; confirm to replace it.`
    )
  }
  await ensureLinuxHeadlessDisplay()
  await ensurePrerequisites()
  const wasEnabled = existing ? await isEnabledOrActive('is-enabled') : false
  const wasActive = existing ? await isEnabledOrActive('is-active') : false
  const tempPath = `${linuxHeadlessUnitPath}.tmp-${process.pid}`
  const backupPath = `${linuxHeadlessUnitPath}.backup-${process.pid}`
  let stoppedExisting = false
  let backedUp = false
  let installedNew = false
  let enableAttempted = false
  try {
    await mkdir(linuxHeadlessUnitDirectory, { recursive: true, mode: 0o700 })
    await writeFile(tempPath, nextUnit, { mode: 0o600 })
    if (existing && wasActive) {
      await systemctl(['stop', LINUX_HEADLESS_UNIT_NAME])
      stoppedExisting = true
    }
    if (existing) {
      await rename(linuxHeadlessUnitPath, backupPath)
      backedUp = true
    }
    await rename(tempPath, linuxHeadlessUnitPath)
    installedNew = true
    await systemctl(['daemon-reload'])
    enableAttempted = true
    await systemctl(['enable', LINUX_HEADLESS_UNIT_NAME])
    if (existing) {await unlink(backupPath)}
  } catch (error) {
    const rollbackFailures: unknown[] = []
    await captureHeadlessRollbackFailure(rollbackFailures, () =>
      unlinkHeadlessServiceFileIfPresent(tempPath)
    )
    if (existing) {
      let restored = !backedUp
      if (backedUp) {
        await captureHeadlessRollbackFailure(rollbackFailures, async () => {
          await rename(backupPath, linuxHeadlessUnitPath)
          restored = true
        })
        if (restored) {
          await captureHeadlessRollbackFailure(rollbackFailures, () => systemctl(['daemon-reload']))
          await captureHeadlessRollbackFailure(rollbackFailures, () =>
            systemctl([wasEnabled ? 'enable' : 'disable', LINUX_HEADLESS_UNIT_NAME])
          )
        }
      }
      if (wasActive && (stoppedExisting || backedUp)) {
        if (restored && (!backedUp || rollbackFailures.length === 0)) {
          await captureHeadlessRollbackFailure(rollbackFailures, () =>
            systemctl(['start', LINUX_HEADLESS_UNIT_NAME])
          )
        }
      }
    } else {
      if (enableAttempted) {
        await captureHeadlessRollbackFailure(rollbackFailures, () =>
          systemctl(['disable', LINUX_HEADLESS_UNIT_NAME])
        )
      }
      if (installedNew) {
        await captureHeadlessRollbackFailure(rollbackFailures, () =>
          unlinkHeadlessServiceFileIfPresent(linuxHeadlessUnitPath)
        )
        await captureHeadlessRollbackFailure(rollbackFailures, () => systemctl(['daemon-reload']))
      }
    }
    throwHeadlessMutationFailure(error, rollbackFailures, 'Installing the Orca headless service')
  }
  return getManagedLinuxHeadlessServiceSnapshot()
}

export async function setManagedLinuxHeadlessServiceRunning(
  running: boolean,
  options: { startNow?: boolean } = {}
): Promise<LinuxHeadlessServiceSnapshot> {
  assertSupportedLinuxUser()
  const unit = await readFile(linuxHeadlessUnitPath, 'utf8').catch(() => '')
  if (!unit.startsWith(`${LINUX_HEADLESS_UNIT_MARKER}\n`)) {
    throw new Error('The Orca headless service has not been installed.')
  }
  if (running) {await enableManagedLinuxHeadlessLinger()}
  await systemctl(
    running
      ? ['enable', ...(options.startNow ? ['--now'] : []), LINUX_HEADLESS_UNIT_NAME]
      : ['disable', '--now', LINUX_HEADLESS_UNIT_NAME]
  )
  return getManagedLinuxHeadlessServiceSnapshot()
}

export async function removeManagedLinuxHeadlessService(): Promise<LinuxHeadlessServiceSnapshot> {
  assertSupportedLinuxUser()
  const unit = await readFile(linuxHeadlessUnitPath, 'utf8').catch(() => '')
  if (!unit.startsWith(`${LINUX_HEADLESS_UNIT_MARKER}\n`)) {
    throw new Error('The Orca headless service has not been installed.')
  }
  const wasEnabled = await isEnabledOrActive('is-enabled')
  const wasActive = await isEnabledOrActive('is-active')
  const backupPath = `${linuxHeadlessUnitPath}.remove-${process.pid}`
  let moved = false
  try {
    await systemctl(['disable', '--now', LINUX_HEADLESS_UNIT_NAME])
    await rename(linuxHeadlessUnitPath, backupPath)
    moved = true
    await systemctl(['daemon-reload'])
  } catch (error) {
    const rollbackFailures: unknown[] = []
    let restored = !moved
    if (moved) {
      await captureHeadlessRollbackFailure(rollbackFailures, async () => {
        await rename(backupPath, linuxHeadlessUnitPath)
        restored = true
      })
    }
    if (restored) {
      await captureHeadlessRollbackFailure(rollbackFailures, () => systemctl(['daemon-reload']))
      await captureHeadlessRollbackFailure(rollbackFailures, () =>
        systemctl([wasEnabled ? 'enable' : 'disable', LINUX_HEADLESS_UNIT_NAME])
      )
      if (wasActive) {
        await captureHeadlessRollbackFailure(rollbackFailures, () =>
          systemctl(['start', LINUX_HEADLESS_UNIT_NAME])
        )
      }
    }
    throwHeadlessMutationFailure(error, rollbackFailures, 'Removing the Orca headless service')
  }
  await unlinkHeadlessServiceFileIfPresent(backupPath)
  return getManagedLinuxHeadlessServiceSnapshot()
}
