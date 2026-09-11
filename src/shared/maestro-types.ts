export type MaestroMissionStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'RUNNING'
  | 'WAITING'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED'

export type MaestroTaskStatus = 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'CANCELLED'

export type MaestroTask = {
  id: string
  title: string
  status: MaestroTaskStatus
  depends_on: string[]
  executor?: string | null
  prompt_file?: string | null
  run_file?: string | null
  error?: string | null
}

export type MaestroMissionSummary = {
  id: string
  project: string
  objective: string
  status: MaestroMissionStatus
  squad?: string | null
  tasks: MaestroTask[]
}

export type MaestroEvent = {
  id: string
  ts: string
  mission_id: string
  type: string
  message: string
  data?: Record<string, unknown>
}

export type MaestroCreateMissionRequest = {
  project: string
  objective: string
  priority?: string
  squad?: string
}

export type MaestroMissionRequest = {
  missionId: string
}

export type MaestroPlanMissionRequest = MaestroMissionRequest & {
  force?: boolean
}

export type MaestroListMissionsRequest = {
  project?: string
  limit?: number
}
