import type {
  MaestroCreateMissionRequest,
  MaestroEvent,
  MaestroListMissionsRequest,
  MaestroMissionRequest,
  MaestroMissionSummary,
  MaestroPlanMissionRequest
} from '../../shared/maestro-types'

export type MaestroApi = {
  createMission: (request: MaestroCreateMissionRequest) => Promise<MaestroMissionSummary>
  listMissions: (request?: MaestroListMissionsRequest | null) => Promise<MaestroMissionSummary[]>
  planMission: (request: MaestroPlanMissionRequest) => Promise<MaestroMissionSummary>
  runMission: (request: MaestroMissionRequest) => Promise<MaestroMissionSummary>
  getMission: (request: MaestroMissionRequest) => Promise<MaestroMissionSummary>
  getEvents: (request: MaestroMissionRequest) => Promise<MaestroEvent[]>
}
