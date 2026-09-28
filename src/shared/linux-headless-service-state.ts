import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from './child-process/run-process'
import type { LinuxHeadlessServiceSnapshot } from './linux-headless-service'

export const LINUX_HEADLESS_UNIT_NAME = 'orca-serve.service'
export const LINUX_HEADLESS_UNIT_MARKER = '# Installed by Orca'
export const linuxHeadlessUnitDirectory = path.join(os.homedir(), '.config', 'systemd', 'user')
export const linuxHeadlessUnitPath = path.join(linuxHeadlessUnitDirectory, LINUX_HEADLESS_UNIT_NAME)

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

function parseUnitValue(unit: string, flag: string): string | null {
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = unit.match(new RegExp(`(?:^|\\s)${escapedFlag}\\s+("(?:\\\\.|[^"\\\\])*")`, 'mu'))
  return (
    match?.[1].slice(1, -1).replace(/\\(.)/gsu, '$1').replaceAll('%%', '%').replaceAll('$$', '$') ??
    null
  )
}

export async function getManagedLinuxHeadlessServiceSnapshot(): Promise<LinuxHeadlessServiceSnapshot> {
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
  let unit = ''
  try {
    unit = await readFile(linuxHeadlessUnitPath, 'utf8')
  } catch {
    // No unit has been installed yet.
  }
  const installed = unit.startsWith(`${LINUX_HEADLESS_UNIT_MARKER}\n`)
  const rawPort = unit.match(/(?:^|\s)--serve-port\s+(\d+)(?:\s|$)/mu)?.[1]
  const parsedPort = rawPort ? Number(rawPort) : null
  const linger = await runProcess({
    program: '/usr/bin/loginctl',
    args: ['show-user', os.userInfo().username, '--property=Linger', '--value'],
    timeoutMs: 5_000
  }).catch(() => null)
  return {
    supported: true,
    installed,
    enabled: installed && (await isEnabledOrActive('is-enabled')),
    active: installed && (await isEnabledOrActive('is-active')),
    linger: linger?.code === 0 && linger.stdout.trim() === 'yes',
    pairingAddress: installed ? parseUnitValue(unit, '--serve-pairing-address') : null,
    port: parsedPort && parsedPort <= 65535 ? parsedPort : null
  }
}

export async function isLinuxHeadlessServiceUnitInstalled(): Promise<boolean> {
  const unit = await readFile(linuxHeadlessUnitPath, 'utf8').catch(() => '')
  return unit.startsWith(`${LINUX_HEADLESS_UNIT_MARKER}\n`)
}
