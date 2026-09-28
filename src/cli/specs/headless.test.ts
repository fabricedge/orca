import { describe, expect, it } from 'vitest'
import { COMMAND_SPECS } from './index'
import { isCommandGroup } from '../args'
import { CLI_BOOLEAN_FLAGS } from '../../shared/cli-argument-boundary'

describe('headless service command specs', () => {
  it('registers local lifecycle commands and the noninteractive overwrite flag', () => {
    const commands = COMMAND_SPECS.filter((spec) => spec.path[0] === 'headless')
    expect(commands.map((spec) => spec.path.join(' '))).toEqual([
      'headless install',
      'headless status',
      'headless start',
      'headless stop',
      'headless remove'
    ])
    expect(commands[0]?.allowedFlags).toContain('yes')
    expect(CLI_BOOLEAN_FLAGS.has('yes')).toBe(true)
    expect(isCommandGroup(COMMAND_SPECS, ['headless'])).toBe(true)
  })
})
