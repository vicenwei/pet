import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApiTestInput,
  ApiTestResult,
  AppSnapshot,
  AssetStatus,
  GenerationProgress,
  InteractionState,
  LogEntry,
  PetAction,
  SaveConfigInput,
  ThoughtTrace
} from '../shared/types';

const on = <T>(channel: string, callback: (payload: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('senyuAPI', {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('app:get-snapshot'),
  saveConfig: (input: SaveConfigInput) => ipcRenderer.invoke('config:save', input),
  clearConfig: () => ipcRenderer.invoke('config:clear'),
  testApi: (input: ApiTestInput): Promise<ApiTestResult> => ipcRenderer.invoke('api:test', input),
  refreshAssets: (): Promise<AssetStatus> => ipcRenderer.invoke('assets:refresh'),
  openPetsFolder: () => ipcRenderer.invoke('assets:open-folder'),
  openGeneratedFolder: () => ipcRenderer.invoke('assets:open-generated-folder'),
  chooseBaseImage: () => ipcRenderer.invoke('assets:choose-base-image'),
  generateAllActions: () => ipcRenderer.invoke('generation:generate-all'),
  generateOneAction: (action: PetAction) => ipcRenderer.invoke('generation:generate-one', action),
  showPet: () => ipcRenderer.invoke('pet:show'),
  hidePet: () => ipcRenderer.invoke('pet:hide'),
  exitApp: () => ipcRenderer.invoke('app:exit'),
  openAdmin: () => ipcRenderer.invoke('admin:show'),
  triggerPetState: (state: InteractionState) => ipcRenderer.invoke('pet:trigger-state', state),
  forcePetAction: (action: PetAction) => ipcRenderer.invoke('pet:force-action', action),
  reportTrace: (trace: ThoughtTrace) => ipcRenderer.invoke('trace:add', trace),
  clearTraces: () => ipcRenderer.invoke('trace:clear'),
  exportTraces: () => ipcRenderer.invoke('trace:export'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  copyLogs: () => ipcRenderer.invoke('logs:copy'),
  setPetState: (state: InteractionState) => ipcRenderer.invoke('pet:state-changed', state),
  dragStart: () => ipcRenderer.invoke('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.invoke('pet:drag-end'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  onConfigUpdate: (callback: (payload: AppSnapshot['config']) => void) => on('config:update', callback),
  onAssetsUpdate: (callback: (payload: AssetStatus) => void) => on('assets:update', callback),
  onLogsUpdate: (callback: (payload: LogEntry[]) => void) => on('logs:update', callback),
  onTracesUpdate: (callback: (payload: ThoughtTrace[]) => void) => on('traces:update', callback),
  onGenerationProgress: (callback: (payload: GenerationProgress) => void) => on('generation:progress', callback),
  onPetVisibility: (callback: (payload: boolean) => void) => on('pet:visibility', callback),
  onPetStateUpdate: (callback: (payload: InteractionState) => void) => on('pet:state', callback),
  onTriggerState: (callback: (payload: InteractionState) => void) => on('pet:trigger-state', callback),
  onForceAction: (callback: (payload: PetAction) => void) => on('pet:force-action', callback)
});
