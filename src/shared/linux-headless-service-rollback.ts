import { unlink } from 'node:fs/promises'

export async function unlinkHeadlessServiceFileIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function captureHeadlessRollbackFailure(
  failures: unknown[],
  rollback: () => Promise<unknown>
): Promise<void> {
  try {
    await rollback()
  } catch (error) {
    failures.push(error)
  }
}

export function throwHeadlessMutationFailure(
  error: unknown,
  rollbackFailures: unknown[],
  action: string
): never {
  if (rollbackFailures.length === 0) {
    throw error
  }
  throw new AggregateError(
    [error, ...rollbackFailures],
    `${action} failed: ${error instanceof Error ? error.message : String(error)}. ` +
      'Rollback was incomplete; inspect the Orca unit and systemd state.'
  )
}
