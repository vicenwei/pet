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
} from './shared/types';

declare global {
  interface Window {
    senyuAPI: {
      getSnapshot: () => Promise<AppSnapshot>;
      saveConfig: (input: SaveConfigInput) => Promise<AppConfigView>;
      clearConfig: () => Promise<AppConfigView>;
      testApi: (input: ApiTestInput) => Promise<ApiTestResult>;
      refreshAssets: () => Promise<AssetStatus>;
      openPetsFolder: () => Promise<void>;
      chooseBaseImage: () => Promise<AssetStatus>;
      generateAllActions: () => Promise<GenerationProgress>;
      generateOneAction: (action: PetAction) => Promise<GenerationProgress>;
      showPet: () => Promise<void>;
      hidePet: () => Promise<void>;
      exitApp: () => Promise<void>;
      openAdmin: () => Promise<void>;
      triggerPetState: (state: InteractionState) => Promise<void>;
      forcePetAction: (action: PetAction) => Promise<void>;
      reportTrace: (trace: ThoughtTrace) => Promise<void>;
      clearTraces: () => Promise<void>;
      exportTraces: () => Promise<string>;
      clearLogs: () => Promise<void>;
      copyLogs: () => Promise<void>;
      setPetState: (state: InteractionState) => Promise<void>;
      dragStart: () => Promise<void>;
      dragMove: () => void;
      dragEnd: () => Promise<void>;
      windowMinimize: () => Promise<void>;
      windowClose: () => Promise<void>;
      onConfigUpdate: (callback: (payload: AppConfigView) => void) => () => void;
      onAssetsUpdate: (callback: (payload: AssetStatus) => void) => () => void;
      onLogsUpdate: (callback: (payload: LogEntry[]) => void) => () => void;
      onTracesUpdate: (callback: (payload: ThoughtTrace[]) => void) => () => void;
      onGenerationProgress: (callback: (payload: GenerationProgress) => void) => () => void;
      onPetVisibility: (callback: (payload: boolean) => void) => () => void;
      onPetStateUpdate: (callback: (payload: InteractionState) => void) => () => void;
      onTriggerState: (callback: (payload: InteractionState) => void) => () => void;
      onForceAction: (callback: (payload: PetAction) => void) => () => void;
    };
  }
}

export {};

