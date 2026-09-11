import { ipcMain } from 'electron'
import { join } from 'node:path'
import { runProcess } from '../../shared/child-process/run-process'
import type {
  MaestroCreateMissionRequest,
  MaestroEvent,
  MaestroListMissionsRequest,
  MaestroMissionRequest,
  MaestroMissionSummary,
  MaestroPlanMissionRequest
} from '../../shared/maestro-types'

const DEFAULT_ORCHESTRATOR_ROOT = '/home/katri/programming/ollama_orchestrator247'
const MAESTRO_TIMEOUT_MS = 15 * 60 * 1000

function orchestratorRoot(): string {
  return process.env.MAESTRO_ORCHESTRATOR_ROOT || DEFAULT_ORCHESTRATOR_ROOT
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

async function runMaestro<T>(args: readonly string[], allowNonZero = false): Promise<T> {
  const root = orchestratorRoot()
  const result = await runProcess({
    program: 'python3',
    args: [join(root, 'scripts', 'maestro.py'), ...args],
    cwd: root,
    timeoutMs: MAESTRO_TIMEOUT_MS,
    maxOutputBytes: 1024 * 1024
  })
  if (!allowNonZero && result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `maestro exited with ${result.code}`).trim())
  }
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    throw new Error((result.stderr || result.stdout || 'maestro returned invalid JSON').trim())
  }
}

function createMission(request: MaestroCreateMissionRequest): Promise<MaestroMissionSummary> {
  const args = [
    'mission-create',
    '--project',
    requireNonEmpty(request.project, 'Project'),
    '--objective',
    requireNonEmpty(request.objective, 'Objective')
  ]
  if (request.priority?.trim()) {
    args.push('--priority', request.priority.trim())
  }
  if (request.squad?.trim()) {
    args.push('--squad', request.squad.trim())
  }
  return runMaestro<MaestroMissionSummary>(args)
}

function listMissions(request?: MaestroListMissionsRequest | null): Promise<MaestroMissionSummary[]> {
  const args = ['mission-list']
  if (request?.project?.trim()) {
    args.push('--project', request.project.trim())
  }
  if (typeof request?.limit === 'number' && Number.isFinite(request.limit)) {
    args.push('--limit', String(Math.max(1, Math.min(200, Math.trunc(request.limit)))))
  }
  return runMaestro<MaestroMissionSummary[]>(args)
}

function planMission(request: MaestroPlanMissionRequest): Promise<MaestroMissionSummary> {
  const args = ['mission-plan', '--mission-id', requireNonEmpty(request.missionId, 'Mission id')]
  if (request.force) {
    args.push('--force')
  }
  return runMaestro<MaestroMissionSummary>(args)
}

function runMission(request: MaestroMissionRequest): Promise<MaestroMissionSummary> {
  return runMaestro<MaestroMissionSummary>(
    ['mission-run', '--mission-id', requireNonEmpty(request.missionId, 'Mission id')],
    true
  )
}

function getMission(request: MaestroMissionRequest): Promise<MaestroMissionSummary> {
  return runMaestro<MaestroMissionSummary>([
    'mission-status',
    '--mission-id',
    requireNonEmpty(request.missionId, 'Mission id')
  ])
}

function getEvents(request: MaestroMissionRequest): Promise<MaestroEvent[]> {
  return runMaestro<MaestroEvent[]>([
    'events',
    '--mission-id',
    requireNonEmpty(request.missionId, 'Mission id')
  ])
}

export function registerMaestroHandlers(): void {
  ipcMain.handle('maestro:createMission', (_event, request: MaestroCreateMissionRequest) =>
    createMission(request)
  )
  ipcMain.handle('maestro:listMissions', (_event, request?: MaestroListMissionsRequest | null) =>
    listMissions(request)
  )
  ipcMain.handle('maestro:planMission', (_event, request: MaestroPlanMissionRequest) =>
    planMission(request)
  )
  ipcMain.handle('maestro:runMission', (_event, request: MaestroMissionRequest) =>
    runMission(request)
  )
  ipcMain.handle('maestro:getMission', (_event, request: MaestroMissionRequest) =>
    getMission(request)
  )
  ipcMain.handle('maestro:getEvents', (_event, request: MaestroMissionRequest) =>
    getEvents(request)
  )
}
