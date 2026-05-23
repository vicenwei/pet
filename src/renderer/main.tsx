import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bug,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FolderOpen,
  Home,
  Info,
  KeyRound,
  Leaf,
  List,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize,
  MousePointer2,
  Play,
  Power,
  RefreshCcw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from 'lucide-react';
import type {
  AppConfigView,
  AssetStatus,
  GenerationProgress,
  InteractionState,
  LogEntry,
  PetAction,
  SaveConfigInput,
  ThoughtTrace
} from '@shared/types';
import { ACTION_LABELS, PET_ACTIONS } from '@shared/actionPrompts';
import {
  DEBUG_STATES,
  STATE_DEFINITIONS,
  createThoughtTrace,
  pickBubble,
  pickClickAction
} from '@pet/stateMachine';
import './styles.css';

const emptyConfig: AppConfigView = {
  imageApiBaseUrl: '',
  imageModel: 'gpt-image-1',
  petBaseImage: 'assets/pets/senyu_base.png',
  generatedDir: 'assets/pets/generated',
  showBubble: true,
  showThinkingPath: true,
  petScale: 1,
  alwaysOnTop: true,
  skipTaskbar: true,
  hasApiKey: false,
  apiKeyMasked: '',
  configPath: '',
  secureStorage: false
};

const emptyAssets: AssetStatus = {
  base: {
    relativePath: 'assets/pets/senyu_base.png',
    filePath: '',
    fileUrl: '',
    exists: false
  },
  generatedDir: '',
  actions: []
};

const emptyGeneration: GenerationProgress = {
  running: false,
  currentAction: null,
  completed: 0,
  total: PET_ACTIONS.length,
  statusText: '等待生成',
  lastError: ''
};

function isPetRoute(): boolean {
  return window.location.hash.includes('/pet');
}

function useBodyMode(mode: 'admin' | 'pet') {
  useEffect(() => {
    document.body.classList.toggle('pet-body', mode === 'pet');
    document.body.classList.toggle('admin-body', mode === 'admin');
  }, [mode]);
}

function App() {
  return isPetRoute() ? <PetApp /> : <AdminApp />;
}

function WindowTitle({ title }: { title: string }) {
  return (
    <div className="window-titlebar">
      <div className="window-title">
        <Leaf size={20} />
        <span>{title}</span>
      </div>
      <div className="window-controls">
        <button type="button" onClick={() => window.senyuAPI.windowMinimize()} aria-label="最小化">
          <Minimize size={18} />
        </button>
        <button type="button" onClick={() => window.senyuAPI.windowClose()} aria-label="关闭">
          <X size={19} />
        </button>
      </div>
    </div>
  );
}

function AdminApp() {
  useBodyMode('admin');
  const [config, setConfig] = useState<AppConfigView>(emptyConfig);
  const [assets, setAssets] = useState<AssetStatus>(emptyAssets);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [traces, setTraces] = useState<ThoughtTrace[]>([]);
  const [generation, setGeneration] = useState<GenerationProgress>(emptyGeneration);
  const [petVisible, setPetVisible] = useState(false);
  const [currentPetState, setCurrentPetState] = useState<InteractionState>('idle');
  const [draft, setDraft] = useState<SaveConfigInput>({
    imageApiBaseUrl: '',
    imageApiKey: '',
    imageModel: 'gpt-image-1',
    showBubble: true,
    showThinkingPath: true,
    petScale: 1,
    alwaysOnTop: true,
    skipTaskbar: true
  });
  const [showKey, setShowKey] = useState(false);
  const [apiTestStatus, setApiTestStatus] = useState('未测试');
  const canGenerate = assets.base.exists && Boolean(draft.imageApiBaseUrl.trim()) && (Boolean(draft.imageApiKey?.trim()) || config.hasApiKey);
  const setupChecks = [
    {
      label: '原始角色图',
      ok: assets.base.exists,
      detail: assets.base.exists ? '已找到 senyu_base.png' : '还没有放入原始图'
    },
    {
      label: 'API URL',
      ok: Boolean(draft.imageApiBaseUrl.trim()),
      detail: draft.imageApiBaseUrl.trim() ? draft.imageApiBaseUrl.trim() : '还没有填写'
    },
    {
      label: 'API Key',
      ok: Boolean(draft.imageApiKey?.trim()) || config.hasApiKey,
      detail: draft.imageApiKey?.trim() ? '本次会使用新填写的 Key' : config.hasApiKey ? `已保存 ${config.apiKeyMasked}` : '还没有填写'
    },
    {
      label: '动作图',
      ok: assets.actions.length > 0 && assets.actions.every((item) => item.exists),
      detail: `${assets.actions.filter((item) => item.exists).length}/${PET_ACTIONS.length} 已生成`
    }
  ];
  const recentLogs = logs.slice(-4).reverse();

  useEffect(() => {
    window.senyuAPI.getSnapshot().then((snapshot) => {
      setConfig(snapshot.config);
      setAssets(snapshot.assets);
      setLogs(snapshot.logs);
      setTraces(snapshot.traces);
      setGeneration(snapshot.generation);
      setPetVisible(snapshot.petVisible);
      setCurrentPetState(snapshot.currentPetState);
      setDraft({
        imageApiBaseUrl: snapshot.config.imageApiBaseUrl,
        imageApiKey: '',
        imageModel: snapshot.config.imageModel,
        showBubble: snapshot.config.showBubble,
        showThinkingPath: snapshot.config.showThinkingPath,
        petScale: snapshot.config.petScale,
        alwaysOnTop: snapshot.config.alwaysOnTop,
        skipTaskbar: snapshot.config.skipTaskbar
      });
    });

    const disposers = [
      window.senyuAPI.onConfigUpdate((next) => {
        setConfig(next);
        setDraft((old) => ({
          ...old,
          imageApiBaseUrl: next.imageApiBaseUrl,
          imageModel: next.imageModel,
          showBubble: next.showBubble,
          showThinkingPath: next.showThinkingPath,
          petScale: next.petScale,
          alwaysOnTop: next.alwaysOnTop,
          skipTaskbar: next.skipTaskbar
        }));
      }),
      window.senyuAPI.onAssetsUpdate(setAssets),
      window.senyuAPI.onLogsUpdate(setLogs),
      window.senyuAPI.onTracesUpdate(setTraces),
      window.senyuAPI.onGenerationProgress(setGeneration),
      window.senyuAPI.onPetVisibility(setPetVisible),
      window.senyuAPI.onPetStateUpdate(setCurrentPetState)
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, []);

  const saveConfig = async () => {
    const next = await window.senyuAPI.saveConfig(draft);
    setConfig(next);
    setDraft((old) => ({ ...old, imageApiKey: '' }));
  };

  const clearConfig = async () => {
    if (!window.confirm('确认清除本地 API 配置？清除后需要重新填写 API URL 和 API Key。')) return;
    const next = await window.senyuAPI.clearConfig();
    setConfig(next);
    setDraft({
      imageApiBaseUrl: '',
      imageApiKey: '',
      imageModel: 'gpt-image-1',
      showBubble: true,
      showThinkingPath: true,
      petScale: 1,
      alwaysOnTop: true,
      skipTaskbar: true
    });
  };

  const testApi = async () => {
    setApiTestStatus('测试中...');
    const result = await window.senyuAPI.testApi({
      imageApiBaseUrl: draft.imageApiBaseUrl,
      imageApiKey: draft.imageApiKey,
      imageModel: draft.imageModel
    });
    setApiTestStatus(result.message);
  };

  const confirmGeneration = async (action?: PetAction) => {
    if (!canGenerate) {
      window.alert('请先放入原始角色图，并填写 API URL 和 API Key。');
      return;
    }
    const ok = window.confirm('生成动作图会把原始角色图发送到你填写的第三方生图 API，请确认服务可信，并注意可能产生调用费用。');
    if (!ok) return;
    if (action) await window.senyuAPI.generateOneAction(action);
    else await window.senyuAPI.generateAllActions();
  };

  const navItems = [
    { id: 'base', label: '基础设置', icon: Home },
    { id: 'api', label: '生图 API', icon: KeyRound },
    { id: 'appearance', label: '外观设置', icon: Maximize2 },
    { id: 'actions', label: '动作生成', icon: WandSparkles },
    { id: 'states', label: '互动状态', icon: MousePointer2 },
    { id: 'thinking', label: '思考路径', icon: MessageCircle },
    { id: 'logs', label: '日志调试', icon: Bug },
    { id: 'about', label: '关于森屿', icon: Info }
  ];

  return (
    <div className="admin-shell">
      <WindowTitle title="森屿桌宠 - 后台工具" />
      <div className="admin-layout">
        <aside className="sidebar">
          <div className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="sidebar-footer">
            <div className="mini-avatar">
              {assets.base.fileUrl ? <img src={assets.base.fileUrl} alt="森屿" /> : <Leaf size={36} />}
            </div>
            <strong>森屿桌宠</strong>
            <span>版本：0.1.0</span>
            <span className={petVisible ? 'status-dot online' : 'status-dot'}>{petVisible ? '运行中' : '已隐藏'}</span>
          </div>
        </aside>

        <main className="admin-content">
          <header className="topbar">
            <div>
              <h1>森屿桌宠 - 后台工具</h1>
              <p>当前状态：{petVisible ? '桌宠显示中' : '桌宠已隐藏'}，状态机：{currentPetState}</p>
            </div>
            <div className="top-actions">
              <button type="button" className="primary" onClick={() => window.senyuAPI.showPet()}>
                <Play size={17} />
                启动桌宠
              </button>
              <button type="button" onClick={() => window.senyuAPI.hidePet()}>
                <EyeOff size={17} />
                隐藏桌宠
              </button>
              <button type="button" className="danger" onClick={() => window.confirm('确认退出森屿桌宠？') && window.senyuAPI.exitApp()}>
                <Power size={17} />
                退出
              </button>
            </div>
          </header>

          <section id="base" className="tool-section">
            <div className="section-title">
              <FileImage size={21} />
              <h2>原始角色图</h2>
            </div>
            <div className="base-grid">
              <div className="image-preview">
                {assets.base.exists ? <img src={assets.base.fileUrl} alt="原始角色图" /> : <span>未找到原始图</span>}
              </div>
              <div className="field-stack">
                <div className="path-line">路径：{assets.base.relativePath}</div>
                <div className={assets.base.exists ? 'success-line' : 'warn-line'}>
                  {assets.base.exists ? <CheckCircle2 size={17} /> : <Info size={17} />}
                  {assets.base.exists ? '图片已找到' : '请放入 assets/pets/senyu_base.png'}
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => window.senyuAPI.openPetsFolder()}>
                    <FolderOpen size={17} />
                    打开文件夹
                  </button>
                  <button type="button" onClick={() => window.senyuAPI.openGeneratedFolder()}>
                    <FolderOpen size={17} />
                    打开生成目录
                  </button>
                  <button type="button" onClick={() => window.senyuAPI.chooseBaseImage().then(setAssets)}>
                    <FileImage size={17} />
                    更换图片
                  </button>
                  <button type="button" onClick={() => window.senyuAPI.refreshAssets().then(setAssets)}>
                    <RefreshCcw size={17} />
                    刷新检测
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section id="api" className="tool-section">
            <div className="section-title">
              <KeyRound size={21} />
              <h2>生图 API 配置</h2>
            </div>
            <div className="form-grid">
              <label>
                <span>API URL</span>
                <input
                  value={draft.imageApiBaseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => setDraft((old) => ({ ...old, imageApiBaseUrl: event.target.value }))}
                />
              </label>
              <label>
                <span>API Key</span>
                <div className="input-with-button">
                  <input
                    value={draft.imageApiKey}
                    type={showKey ? 'text' : 'password'}
                    placeholder={config.hasApiKey ? `已保存 ${config.apiKeyMasked}` : '填写 API Key'}
                    onChange={(event) => setDraft((old) => ({ ...old, imageApiKey: event.target.value }))}
                  />
                  <button type="button" onClick={() => setShowKey((value) => !value)} aria-label="显示或隐藏 API Key">
                    {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label>
                <span>图像模型</span>
                <input
                  list="image-model-options"
                  value={draft.imageModel}
                  placeholder="gpt-image-1"
                  onChange={(event) => setDraft((old) => ({ ...old, imageModel: event.target.value }))}
                />
                <datalist id="image-model-options">
                  <option value="gpt-image-1" />
                </datalist>
              </label>
            </div>
            <div className="button-row">
              <button type="button" className="primary" onClick={testApi}>
                <Activity size={17} />
                测试连接
              </button>
              <button type="button" className="primary subtle" onClick={saveConfig}>
                <Save size={17} />
                保存配置
              </button>
              <button type="button" onClick={clearConfig}>
                <Trash2 size={17} />
                清除配置
              </button>
              <span className="muted-text">测试状态：{apiTestStatus}</span>
            </div>
          </section>

          <section id="appearance" className="tool-section">
            <div className="section-title">
              <Settings size={21} />
              <h2>外观和窗口</h2>
            </div>
            <div className="setting-grid">
              <div className="scale-control">
                <div className="field-heading">
                  <span>桌宠大小</span>
                  <strong>{Math.round(draft.petScale * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.6"
                  step="0.05"
                  value={draft.petScale}
                  onChange={(event) => setDraft((old) => ({ ...old, petScale: Number(event.target.value) }))}
                />
                <div className="preset-row">
                  {[0.8, 1, 1.25, 1.5].map((scale) => (
                    <button type="button" key={scale} onClick={() => setDraft((old) => ({ ...old, petScale: scale }))}>
                      {Math.round(scale * 100)}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="toggle-panel">
                <label><input type="checkbox" checked={draft.showBubble} onChange={(event) => setDraft((old) => ({ ...old, showBubble: event.target.checked }))} />显示普通气泡</label>
                <label><input type="checkbox" checked={draft.showThinkingPath} onChange={(event) => setDraft((old) => ({ ...old, showThinkingPath: event.target.checked }))} />显示思考路径气泡</label>
                <label><input type="checkbox" checked={draft.alwaysOnTop} onChange={(event) => setDraft((old) => ({ ...old, alwaysOnTop: event.target.checked }))} />桌宠置顶</label>
                <label><input type="checkbox" checked={draft.skipTaskbar} onChange={(event) => setDraft((old) => ({ ...old, skipTaskbar: event.target.checked }))} />不显示任务栏</label>
              </div>
            </div>
            <div className="button-row">
              <button type="button" className="primary subtle" onClick={saveConfig}>
                <Save size={17} />
                保存外观设置
              </button>
              <span className="muted-text">保存后会立即应用到桌宠窗口。</span>
            </div>
          </section>

          <section id="actions" className="tool-section">
            <div className="section-title">
              <WandSparkles size={21} />
              <h2>动作生成与预览</h2>
            </div>
            <div className="generation-bar">
              <button type="button" className="primary" disabled={!canGenerate || generation.running} onClick={() => confirmGeneration()}>
                {generation.running ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                生成动作图
              </button>
              <button type="button" disabled={!canGenerate || generation.running} onClick={() => confirmGeneration()}>
                <RefreshCcw size={17} />
                重新生成
              </button>
              <span>{generation.statusText}</span>
              <progress value={generation.completed} max={Math.max(generation.total, 1)} />
            </div>
            <div className="quick-grid">
              <div className="quick-panel">
                <div className="field-heading">
                  <span>快速检查</span>
                  <strong>{setupChecks.every((item) => item.ok) ? '已就绪' : '待补全'}</strong>
                </div>
                <div className="check-list">
                  {setupChecks.map((item) => (
                    <div className={item.ok ? 'check-item ready' : 'check-item'} key={item.label}>
                      {item.ok ? <CheckCircle2 size={16} /> : <Info size={16} />}
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="quick-panel">
                <div className="field-heading">
                  <span>最近日志</span>
                  <strong>{logs.length} 条</strong>
                </div>
                <div className="mini-log">
                  {recentLogs.length === 0 ? <span>暂无日志</span> : recentLogs.map((log) => (
                    <p key={log.id} className={`log-${log.level}`}>[{log.time}] [{log.scope}] {log.message}</p>
                  ))}
                </div>
              </div>
            </div>
            {generation.lastError ? <div className="error-box">失败原因：{generation.lastError}</div> : null}
            <div className="action-grid">
              {PET_ACTIONS.map((action) => {
                const asset = assets.actions.find((item) => item.action === action);
                return (
                  <article className="action-card" key={action}>
                    <div className="action-image">
                      {asset?.fileUrl ? <img src={asset.fileUrl} alt={ACTION_LABELS[action]} /> : <span>无预览</span>}
                    </div>
                    <strong>{action}（{ACTION_LABELS[action]}）</strong>
                    <span className={asset?.exists ? 'success-text' : 'muted-text'}>
                      {asset?.exists ? '文件已生成' : asset?.usesBaseFallback ? '未生成，使用原始图' : '未生成'}
                    </span>
                    <div className="button-row tight">
                      <button type="button" disabled={!canGenerate || generation.running} onClick={() => confirmGeneration(action)}>
                        <RefreshCcw size={15} />
                        生成
                      </button>
                      <button type="button" onClick={() => window.senyuAPI.forcePetAction(action)}>
                        <Play size={15} />
                        应用测试
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section id="states" className="tool-section">
            <div className="section-title">
              <MousePointer2 size={21} />
              <h2>互动状态机调试</h2>
            </div>
            <div className="state-panel">
              <div className="current-state">
                <span>当前状态</span>
                <strong>{currentPetState}</strong>
              </div>
              <div className="state-buttons">
                {DEBUG_STATES.map((state) => (
                  <button type="button" key={state} onClick={() => window.senyuAPI.triggerPetState(state)}>
                    {state}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section id="thinking" className="tool-section">
            <div className="section-title">
              <MessageCircle size={21} />
              <h2>思考路径</h2>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => window.senyuAPI.exportTraces()}>
                <Download size={17} />
                导出 JSON
              </button>
              <button type="button" onClick={() => window.confirm('确认清空思考路径记录？') && window.senyuAPI.clearTraces()}>
                <Trash2 size={17} />
                清空记录
              </button>
            </div>
            <div className="trace-list">
              {traces.length === 0 ? <div className="empty-line">暂无状态路径记录</div> : traces.slice().reverse().map((trace) => (
                <article key={trace.id} className="trace-item">
                  <div><strong>{trace.event}</strong><span>{trace.time}</span></div>
                  <p>判断：{trace.reason}</p>
                  <p>状态切换：{trace.fromState} → {trace.toState}</p>
                  <p>动作：{trace.actionImage || '原始图'}，气泡：{trace.bubbleText || '无'}</p>
                  <p>下一步：{trace.nextState ? `${trace.durationMs}ms 后回到 ${trace.nextState}` : '保持当前状态'}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="logs" className="tool-section">
            <div className="section-title">
              <Bug size={21} />
              <h2>日志调试</h2>
            </div>
            <div className="button-row">
              <button type="button" onClick={() => window.senyuAPI.copyLogs()}>
                <Copy size={17} />
                复制日志
              </button>
              <button type="button" onClick={() => window.confirm('确认清空日志？') && window.senyuAPI.clearLogs()}>
                <Trash2 size={17} />
                清空日志
              </button>
            </div>
            <div className="log-console">
              {logs.length === 0 ? <span>暂无日志</span> : logs.slice().reverse().map((log) => (
                <p key={log.id} className={`log-${log.level}`}>[{log.time}] [{log.scope}] {log.message}</p>
              ))}
            </div>
          </section>

          <section id="about" className="tool-section">
            <div className="section-title">
              <Info size={21} />
              <h2>关于森屿</h2>
            </div>
            <div className="about-grid">
              <p>桌宠窗口只显示角色、气泡和简短状态路径；复杂配置都在这里完成。</p>
              <p>配置保存位置：{config.configPath || '用户数据目录 config.json'}</p>
              <p>API Key 存储：{config.secureStorage ? '系统安全存储加密' : '本机配置文件保存'}</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function PetApp() {
  useBodyMode('pet');
  const [config, setConfig] = useState<AppConfigView>(emptyConfig);
  const [assets, setAssets] = useState<AssetStatus>(emptyAssets);
  const [state, setState] = useState<InteractionState>('idle');
  const [action, setAction] = useState<PetAction>('idle');
  const [bubble, setBubble] = useState('');
  const [thinking, setThinking] = useState('待机中 → 等待互动');
  const [animation, setAnimation] = useState('breathe blink');
  const fromStateRef = useRef<InteractionState>('idle');
  const stateTimerRef = useRef<number | null>(null);
  const longIdleTimerRef = useRef<number | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const pointerRef = useRef({ down: false, dragging: false, startX: 0, startY: 0, suppressClickUntil: 0 });

  useEffect(() => {
    window.senyuAPI.getSnapshot().then((snapshot) => {
      setConfig(snapshot.config);
      setAssets(snapshot.assets);
    });
    const disposers = [
      window.senyuAPI.onConfigUpdate(setConfig),
      window.senyuAPI.onAssetsUpdate(setAssets),
      window.senyuAPI.onTriggerState((next) => transitionTo(next, next)),
      window.senyuAPI.onForceAction((nextAction) => forceAction(nextAction))
    ];
    resetLongIdle();
    transitionTo('idle', 'startup');
    return () => {
      disposers.forEach((dispose) => dispose());
      clearTimers();
    };
  }, []);

  const actionAsset = useMemo(() => assets.actions.find((item) => item.action === action), [action, assets.actions]);
  const imageUrl = actionAsset?.fileUrl || assets.base.fileUrl;

  function clearTimers() {
    if (stateTimerRef.current) window.clearTimeout(stateTimerRef.current);
    if (longIdleTimerRef.current) window.clearTimeout(longIdleTimerRef.current);
    if (touchTimerRef.current) window.clearTimeout(touchTimerRef.current);
  }

  function resetLongIdle() {
    if (longIdleTimerRef.current) window.clearTimeout(longIdleTimerRef.current);
    longIdleTimerRef.current = window.setTimeout(() => {
      transitionTo('long_idle', 'long_idle');
    }, 3 * 60 * 1000);
  }

  function transitionTo(nextState: InteractionState, eventName?: string) {
    const definition = STATE_DEFINITIONS[nextState];
    const fromState = fromStateRef.current;
    let nextAction = definition.imageAction;
    if (nextState === 'click') nextAction = pickClickAction();

    if (stateTimerRef.current) window.clearTimeout(stateTimerRef.current);
    const bubbleText = pickBubble(definition);
    setState(nextState);
    setAction(nextAction);
    setBubble(bubbleText);
    setThinking(definition.thinkingText);
    setAnimation(definition.animation);
    fromStateRef.current = nextState;
    window.senyuAPI.setPetState(nextState);

    const trace = createThoughtTrace({
      event: eventName || definition.triggerEvent,
      fromState,
      toState: nextState,
      reason: definition.reason,
      actionImage: `${nextAction}.png`,
      bubbleText,
      nextState: definition.nextState,
      durationMs: definition.durationMs,
      shortText: definition.thinkingText
    });
    window.senyuAPI.reportTrace(trace);

    if (!['long_idle', 'sleep'].includes(nextState)) resetLongIdle();
    if (definition.durationMs > 0 && definition.nextState) {
      stateTimerRef.current = window.setTimeout(() => transitionTo(definition.nextState!, 'auto_next'), definition.durationMs);
    }
  }

  function forceAction(nextAction: PetAction) {
    setAction(nextAction);
    setBubble(`${ACTION_LABELS[nextAction]}动作`);
    setThinking(`手动测试 → ${ACTION_LABELS[nextAction]}`);
    setAnimation(nextAction === 'drag' ? 'balance' : 'pop');
    window.setTimeout(() => transitionTo('idle', 'force_action_done'), 2200);
  }

  function handlePointerEnter() {
    if (pointerRef.current.dragging) return;
    transitionTo('hover', 'mouse_hover');
    if (touchTimerRef.current) window.clearTimeout(touchTimerRef.current);
    touchTimerRef.current = window.setTimeout(() => {
      if (!pointerRef.current.dragging) transitionTo('touch', 'mouse_touch');
    }, 900);
  }

  function handlePointerLeave() {
    if (touchTimerRef.current) window.clearTimeout(touchTimerRef.current);
    if (pointerRef.current.dragging) return;
    transitionTo('mouse_leave', 'mouse_leave');
  }

  async function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      ...pointerRef.current,
      down: true,
      dragging: false,
      startX: event.clientX,
      startY: event.clientY
    };
    await window.senyuAPI.dragStart();
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!pointerRef.current.down) return;
    const distance = Math.hypot(event.clientX - pointerRef.current.startX, event.clientY - pointerRef.current.startY);
    if (distance > 5) {
      if (!pointerRef.current.dragging) {
        pointerRef.current.dragging = true;
        transitionTo('drag_start', 'drag_start');
      }
      window.senyuAPI.dragMove();
    }
  }

  async function handlePointerUp(event: React.PointerEvent) {
    if (!pointerRef.current.down) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const wasDragging = pointerRef.current.dragging;
    pointerRef.current.down = false;
    pointerRef.current.dragging = false;
    await window.senyuAPI.dragEnd();
    if (wasDragging) {
      pointerRef.current.suppressClickUntil = Date.now() + 350;
      transitionTo('drag_end', 'drag_end');
    }
  }

  async function handlePointerCancel(event: React.PointerEvent) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current.down = false;
    pointerRef.current.dragging = false;
    await window.senyuAPI.dragEnd();
    transitionTo('idle', 'pointer_cancel');
  }

  function handleClick() {
    if (Date.now() < pointerRef.current.suppressClickUntil) return;
    transitionTo('click', 'mouse_click');
  }

  function handleDoubleClick() {
    transitionTo('double_click', 'mouse_double_click');
    window.senyuAPI.openAdmin();
  }

  return (
    <div className={`pet-shell state-${state} anim-${animation.replace(/\s+/g, ' anim-')}`}>
      {config.showBubble && bubble ? <div className="pet-bubble">{bubble}</div> : null}
      <button
        type="button"
        className="pet-hit-area"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        aria-label="森屿桌宠"
      >
        {imageUrl ? <img className="pet-sprite" src={imageUrl} alt="森屿桌宠" draggable={false} /> : <div className="missing-pet">请放入<br />senyu_base.png</div>}
        <span className="blink-layer" />
      </button>
      {config.showThinkingPath && thinking ? <div className="thinking-bubble">{thinking}</div> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
