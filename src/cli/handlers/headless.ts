import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import path from 'node:path'
import type { CommandHandler } from '../dispatch'
import type { LinuxHeadlessServiceSnapshot } from '../../shared/linux-headless-service'
import type { LinuxHeadlessUnitOptions } from '../../shared/linux-headless-service-manager'
import {
  enableManagedLinuxHeadlessLinger,
  installManagedLinuxHeadlessService,
  removeManagedLinuxHeadlessService,
  setManagedLinuxHeadlessServiceRunning
} from '../../shared/linux-headless-service-manager'
import { getManagedLinuxHeadlessServiceSnapshot } from '../../shared/linux-headless-service-state'

function printState(state: LinuxHeadlessServiceSnapshot, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(state, null, 2))
    return
  }
  console.log(
    Object.entries(state)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n')
  )
}

async function install(flags: Map<string, string | boolean>, json: boolean): Promise<void> {
  if (process.platform !== 'linux' || process.getuid?.() === 0) {
    throw new Error('The headless service is available to non-root users on Linux.')
  }
  const portRaw = flags.get('port')
  const port = portRaw === undefined ? 6768 : typeof portRaw === 'string' ? Number(portRaw) : Number.NaN
  const pairingAddress =
    typeof flags.get('pairing-address') === 'string'
      ? String(flags.get('pairing-address')).trim()
      : 'auto'
  const launchTarget = resolveHeadlessServiceLaunchTarget()
  let overwriteExisting = flags.get('yes') === true
  if (!overwriteExisting && (await getManagedLinuxHeadlessServiceSnapshot()).installed) {
    if (!stdin.isTTY || !stdout.isTTY || json) {
      throw new Error('A systemd unit already exists. Re-run with --yes to replace it.')
    }
    const prompt = createInterface({ input: stdin, output: stdout })
    try {
      overwriteExisting = /^y(?:es)?$/iu.test(
        (await prompt.question('Replace the existing Orca service? [y/N] ')).trim()
      )
    } finally {
      prompt.close()
    }
    if (!overwriteExisting) {throw new Error('Installation cancelled; the unit was left unchanged.')}
  }
  const snapshot = await installManagedLinuxHeadlessService(
    {
      ...launchTarget,
      pairingAddress,
      port,
      overwriteExisting
    },
    enableManagedLinuxHeadlessLinger
  )
  if (json) {printState(snapshot, true)}
  else
    {console.log(
      'Installed ~/.config/systemd/user/orca-serve.service. It will start at login and system startup.'
    )}
}

export function resolveHeadlessServiceLaunchTarget({
  electron = Boolean(process.versions.electron),
  executable = process.execPath,
  env = process.env
}: {
  electron?: boolean
  executable?: string
  env?: NodeJS.ProcessEnv
} = {}): Pick<LinuxHeadlessUnitOptions, 'executable' | 'args' | 'environment'> {
  if (env.ORCA_DEV_CLI_INVOCATION === '1') {
    const devExecutable = env.ORCA_APP_EXECUTABLE
    const appRoot = env.ORCA_APP_ROOT
    if (!devExecutable || !path.isAbsolute(devExecutable)) {
      throw new Error('The development CLI has no absolute Electron executable configured.')
    }
    if (env.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT === '1' && (!appRoot || !path.isAbsolute(appRoot))) {
      throw new Error('The development CLI has no absolute app root configured.')
    }
    return {
      executable: devExecutable,
      args: env.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT === '1' && appRoot ? [appRoot] : [],
      environment: env.ORCA_USER_DATA_PATH
        ? { ORCA_DEV_USER_DATA_PATH: env.ORCA_USER_DATA_PATH }
        : {}
    }
  }
  if (!electron) {
    throw new Error('Install the packaged Linux Orca CLI before installing its headless service.')
  }
  const appImage = env.APPIMAGE
  return {
    executable: appImage && path.isAbsolute(appImage) ? appImage : executable,
    args: [],
    environment: {}
  }
}

export const HEADLESS_HANDLERS: Record<string, CommandHandler> = {
  'headless install': async ({ flags, json }) => install(flags, json),
  'headless status': async ({ json }) =>
    printState(await getManagedLinuxHeadlessServiceSnapshot(), json),
  'headless start': async ({ json }) => {
    printState(await setManagedLinuxHeadlessServiceRunning(true, { startNow: true }), json)
  },
  'headless stop': async ({ json }) => {
    printState(await setManagedLinuxHeadlessServiceRunning(false), json)
  },
  'headless remove': async ({ json }) => {
    printState(await removeManagedLinuxHeadlessService(), json)
  }
}
