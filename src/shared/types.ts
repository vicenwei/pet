export type PetAction = 'idle' | 'hover' | 'touch' | 'wave' | 'sleep' | 'talk' | 'surprised' | 'drag';

export type InteractionState =
  | 'idle'
  | 'hover'
  | 'touch'
  | 'click'
  | 'double_click'
  | 'drag_start'
  | 'dragging'
  | 'drag_end'
  | 'long_idle'
  | 'sleep'
  | 'mouse_leave';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface AppConfigView {
  imageApiBaseUrl: string;
  imageModel: string;
  petBaseImage: string;
  generatedDir: string;
  showBubble: boolean;
  showThinkingPath: boolean;
  petScale: number;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  configPath: string;
  secureStorage: boolean;
}

export interface SaveConfigInput {
  imageApiBaseUrl: string;
  imageApiKey?: string;
  imageModel: string;
  showBubble: boolean;
  showThinkingPath: boolean;
  petScale: number;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
}

export interface ActionAsset {
  action: PetAction;
  label: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  exists: boolean;
  usesBaseFallback: boolean;
}

export interface AssetStatus {
  base: {
    relativePath: string;
    filePath: string;
    fileUrl: string;
    exists: boolean;
  };
  generatedDir: string;
  actions: ActionAsset[];
}

export interface ThoughtTrace {
  id: string;
  time: string;
  event: string;
  fromState: InteractionState;
  toState: InteractionState;
  reason: string;
  actionImage: string;
  bubbleText: string;
  nextState: InteractionState | null;
  durationMs: number;
  shortText: string;
}

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
}

export interface GenerationProgress {
  running: boolean;
  currentAction: PetAction | null;
  completed: number;
  total: number;
  statusText: string;
  lastError: string;
}

export interface AppSnapshot {
  config: AppConfigView;
  assets: AssetStatus;
  logs: LogEntry[];
  traces: ThoughtTrace[];
  generation: GenerationProgress;
  petVisible: boolean;
  currentPetState: InteractionState;
}

export interface ApiTestInput {
  imageApiBaseUrl: string;
  imageApiKey?: string;
  imageModel: string;
}

export interface ApiTestResult {
  ok: boolean;
  message: string;
}

