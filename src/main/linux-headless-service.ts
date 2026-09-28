import { app } from 'electron'
import path from 'node:path'
import { runProcess } from '../shared/child-process/run-process'
import type {
  LinuxHeadlessServiceConfig,
  LinuxHeadlessServiceSnapshot
} from '../shared/linux-headless-service'
import {
  enableManagedLinuxHeadlessLinger,
  installManagedLinuxHeadlessService,
  removeManagedLinuxHeadlessService,
  setManagedLinuxHeadlessServiceRunning
} from '../shared/linux-headless-service-manager'
import {
  getManagedLinuxHeadlessServiceSnapshot,
  isLinuxHeadlessServiceUnitInstalled
} from '../shared/linux-headless-service-state'

export async function getLinuxHeadlessServiceSnapshot(): Promise<LinuxHeadlessServiceSnapshot> {
  if (process.platform !== 'linux' || process.getuid?.() === 0) {
    return {
      supported: false,
      installed: false,
      enabled: false,
      active: false,
      linger: false,
      pairingAddress: null,
      port: null
    }
  }
  return getManagedLinuxHeadlessServiceSnapshot()
}

function resolveExecutable(): string {
  const appImage = process.env.APPIMAGE
  return app.isPackaged && appImage && path.isAbsolute(appImage) ? appImage : app.getPath('exe')
}

async function enableLinger(): Promise<void> {
  await enableManagedLinuxHeadlessLinger()
}

async function scheduleHeadlessStartAfterDesktopCloses(): Promise<void> {
  const script =
    'while kill -0 "$1" 2>/dev/null; do sleep 1; done; exec /usr/bin/systemctl --user start orca-serve.service'
  const result = await runProcess({
    program: '/usr/bin/systemd-run',
    args: [
      '--user',
      '--unit=orca-serve-after-desktop-quit',
      '--collect',
      '/bin/sh',
      '-c',
      script,
      'orca-headless-handoff',
      String(process.pid)
    ],
    timeoutMs: 10_000
  })
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Could not schedule the headless server start.')
  }
}

export async function startEnabledLinuxHeadlessServiceAfterDesktopQuit(): Promise<void> {
  if (
    process.platform !== 'linux' ||
    process.getuid?.() === 0 ||
    process.argv.includes('--serve')
  ) {
    return
  }
  const snapshot = await getLinuxHeadlessServiceSnapshot()
  if (!snapshot.installed || !snapshot.enabled || snapshot.active) {return}
  await scheduleHeadlessStartAfterDesktopCloses()
}

export async function enableLinuxHeadlessServiceLinger(): Promise<LinuxHeadlessServiceSnapshot> {
  if (!(await isLinuxHeadlessServiceUnitInstalled())) {
    throw new Error('Install the Orca headless service before enabling background login.')
  }
  await enableLinger()
  return getLinuxHeadlessServiceSnapshot()
}

export async function installLinuxHeadlessService(
  config: LinuxHeadlessServiceConfig
): Promise<LinuxHeadlessServiceSnapshot> {
  if (process.platform !== 'linux' || process.getuid?.() === 0) {
    throw new Error('The headless service requires Linux and a non-root user.')
  }
  const executable = resolveExecutable()
  return installManagedLinuxHeadlessService(
    {
      executable,
      args: app.isPackaged ? [] : [app.getAppPath()],
      environment: app.isPackaged ? {} : { ORCA_DEV_USER_DATA_PATH: app.getPath('userData') },
      pairingAddress: config.pairingAddress,
      port: config.port,
      overwriteExisting: config.overwriteExisting
    },
    async () => {
      await enableLinger()
    }
  )
}

export async function setLinuxHeadlessServiceRunning(
  running: boolean
): Promise<LinuxHeadlessServiceSnapshot> {
  return setManagedLinuxHeadlessServiceRunning(running)
}

export async function removeLinuxHeadlessService(): Promise<LinuxHeadlessServiceSnapshot> {
  return removeManagedLinuxHeadlessService()
}
