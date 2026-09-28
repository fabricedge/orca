import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const SERVICE_FLAGS = [...GLOBAL_FLAGS, 'pairing-address', 'port', 'yes']

export const HEADLESS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['headless', 'install'],
    summary: 'Install the per-user Linux headless server service',
    usage: 'orca headless install [--pairing-address <host|auto>] [--port <port>] [--yes] [--json]',
    allowedFlags: SERVICE_FLAGS,
    examples: [
      'orca headless install',
      'orca headless install --pairing-address auto --port 6768 --yes'
    ]
  },
  {
    path: ['headless', 'status'],
    summary: 'Show Linux headless server service status',
    usage: 'orca headless status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['headless', 'start'],
    summary: 'Start the Linux headless server service',
    usage: 'orca headless start [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['headless', 'stop'],
    summary: 'Stop the Linux headless server service',
    usage: 'orca headless stop [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['headless', 'remove'],
    summary: 'Remove the Linux headless server service',
    usage: 'orca headless remove [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    destructive: true
  }
]
