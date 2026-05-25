import type {
  ApiTestInput,
  ApiTestResult,
  AppConfigView,
  AppSnapshot,
  AssetStatus,
  GenerationProgress,
  InteractionState,
  LogEntry,
  PetAction,
  SaveConfigInput,
  ThoughtTrace
} from '@shared/types';

type SenyuAPI = Window['senyuAPI'];

const controlBaseUrl = 'http://127.0.0.1:17873';
const noopUnsubscribe = () => {};
const isElectronUserAgent = navigator.userAgent.includes('Electron');

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `本机接口请求失败：HTTP ${response.status}`);
  }
  return payload as T;
}

async function get<T>(path: string): Promise<T> {
  return readResponse<T>(await fetch(`${controlBaseUrl}${path}`));
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return readResponse<T>(
    await fetch(`${controlBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {})
    })
  );
}

function createBrowserApi(): SenyuAPI {
  return {
    getSnapshot: () => get<AppSnapshot>('/snapshot'),
    saveConfig: (input: SaveConfigInput) => post<AppConfigView>('/config/save', input),
    clearConfig: () => post<AppConfigView>('/config/clear'),
    testApi: (input: ApiTestInput) => post<ApiTestResult>('/api/test', input),
    refreshAssets: () => get<AssetStatus>('/assets/refresh'),
    openPetsFolder: () => post<void>('/assets/open-folder'),
    openGeneratedFolder: () => post<void>('/assets/open-generated-folder'),
    chooseBaseImage: () => post<AssetStatus>('/assets/choose-base-image'),
    generateAllActions: () => post<GenerationProgress>('/generation/generate-all'),
    generateOneAction: (action: PetAction) => post<GenerationProgress>('/generation/generate-one', { action }),
    showPet: () => post<void>('/pet/show'),
    hidePet: () => post<void>('/pet/hide'),
    exitApp: () => post<void>('/app/exit'),
    openAdmin: async () => {},
    triggerPetState: (state: InteractionState) => post<void>('/pet/trigger-state', { state }),
    forcePetAction: (action: PetAction) => post<void>('/pet/force-action', { action }),
    reportTrace: (trace: ThoughtTrace) => post<void>('/trace/add', trace),
    clearTraces: () => post<void>('/trace/clear'),
    exportTraces: async () => {
      const result = await post<{ filePath: string }>('/trace/export');
      return result.filePath;
    },
    clearLogs: () => post<void>('/logs/clear'),
    copyLogs: () => post<void>('/logs/copy'),
    setPetState: (state: InteractionState) => post<void>('/pet/state-changed', { state }),
    dragStart: () => (isElectronUserAgent ? post<void>('/pet/drag-start') : Promise.resolve()),
    dragMove: () => {
      if (isElectronUserAgent) void post<void>('/pet/drag-move');
    },
    dragEnd: () => (isElectronUserAgent ? post<void>('/pet/drag-end') : Promise.resolve()),
    windowMinimize: () => post<void>('/admin/minimize'),
    windowClose: () => post<void>('/admin/hide'),
    onConfigUpdate: (_callback: (payload: AppConfigView) => void) => noopUnsubscribe,
    onAssetsUpdate: (_callback: (payload: AssetStatus) => void) => noopUnsubscribe,
    onLogsUpdate: (_callback: (payload: LogEntry[]) => void) => noopUnsubscribe,
    onTracesUpdate: (_callback: (payload: ThoughtTrace[]) => void) => noopUnsubscribe,
    onGenerationProgress: (_callback: (payload: GenerationProgress) => void) => noopUnsubscribe,
    onPetVisibility: (_callback: (payload: boolean) => void) => noopUnsubscribe,
    onPetStateUpdate: (_callback: (payload: InteractionState) => void) => noopUnsubscribe,
    onTriggerState: (_callback: (payload: InteractionState) => void) => noopUnsubscribe,
    onForceAction: (_callback: (payload: PetAction) => void) => noopUnsubscribe
  };
}

export const senyuAPI: SenyuAPI = window.senyuAPI ?? createBrowserApi();
export const isBrowserPreview = !window.senyuAPI && !isElectronUserAgent;
