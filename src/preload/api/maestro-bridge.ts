import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  MaestroCreateMissionRequest,
  MaestroListMissionsRequest,
  MaestroMissionRequest,
  MaestroPlanMissionRequest
} from '../../shared/maestro-types'

export const maestroApi = {
  createMission: (request: MaestroCreateMissionRequest) =>
    ipcRenderer.invoke('maestro:createMission', request),
  listMissions: (request?: MaestroListMissionsRequest | null) =>
    ipcRenderer.invoke('maestro:listMissions', request),
  planMission: (request: MaestroPlanMissionRequest) =>
    ipcRenderer.invoke('maestro:planMission', request),
  runMission: (request: MaestroMissionRequest) => ipcRenderer.invoke('maestro:runMission', request),
  getMission: (request: MaestroMissionRequest) => ipcRenderer.invoke('maestro:getMission', request),
  getEvents: (request: MaestroMissionRequest) => ipcRenderer.invoke('maestro:getEvents', request)
} satisfies PreloadApi['maestro']
