export type LinuxHeadlessServiceSnapshot = {
  supported: boolean
  installed: boolean
  enabled: boolean
  active: boolean
  linger: boolean
  pairingAddress: string | null
  port: number | null
}

export type LinuxHeadlessServiceConfig = {
  pairingAddress: string
  port: number
  overwriteExisting?: boolean
}

export const LINUX_HEADLESS_SERVICE_UNIT_EXISTS_ERROR = 'A systemd unit already exists at'
