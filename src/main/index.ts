import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  screen,
  shell
} from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { ACTION_LABELS, PET_ACTIONS, buildActionPrompt } from '../shared/actionPrompts';
import type {
  ApiTestInput,
  ApiTestResult,
  AppConfigView,
  AppSnapshot,
  AssetStatus,
  GenerationProgress,
  InteractionState,
  LogEntry,
  LogLevel,
  PetAction,
  SaveConfigInput,
  ThoughtTrace
} from '../shared/types';

interface StoredConfig {
  imageApiBaseUrl?: string;
  imageApiKeyEncrypted?: string;
  imageApiKeyPlain?: string;
  imageApiKeyStorage?: 'safeStorage' | 'plain';
  imageModel?: string;
  petBaseImage?: string;
  generatedDir?: string;
  showBubble?: boolean;
  showThinkingPath?: boolean;
  petScale?: number;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
}

interface FullConfig {
  imageApiBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
  petBaseImage: string;
  generatedDir: string;
  showBubble: boolean;
  showThinkingPath: boolean;
  petScale: number;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
}

const isDev = !app.isPackaged;
const projectRoot = isDev ? process.cwd() : path.dirname(app.getPath('exe'));
const petsDir = path.join(projectRoot, 'assets', 'pets');
const generatedDir = path.join(petsDir, 'generated');
const baseImagePath = path.join(petsDir, 'senyu_base.png');
const configPath = path.join(app.getPath('userData'), 'config.json');
const controlPort = 17873;
const controlBaseUrl = `http://127.0.0.1:${controlPort}`;

const defaultConfig: FullConfig = {
  imageApiBaseUrl: '',
  imageApiKey: '',
  imageModel: 'gpt-image-1',
  petBaseImage: 'assets/pets/senyu_base.png',
  generatedDir: 'assets/pets/generated',
  showBubble: true,
  showThinkingPath: true,
  petScale: 1,
  alwaysOnTop: true,
  skipTaskbar: true
};

let adminWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let currentConfig: FullConfig = { ...defaultConfig };
let logs: LogEntry[] = [];
let traces: ThoughtTrace[] = [];
let currentPetState: InteractionState = 'idle';
let dragState: { cursor: Electron.Point; bounds: Electron.Rectangle } | null = null;
let generationProgress: GenerationProgress = {
  running: false,
  currentAction: null,
  completed: 0,
  total: PET_ACTIONS.length,
  statusText: '等待生成',
  lastError: ''
};

function isAllowedControlOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return (
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173' ||
    origin === 'http://localhost:17872' ||
    origin === 'http://127.0.0.1:17872'
  );
}

function setControlHeaders(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!isAllowedControlOrigin(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '不允许的本机页面来源' }));
    return false;
  }

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  return true;
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function sendPng(res: ServerResponse, filePath: string): Promise<void> {
  if (!(await fileExists(filePath))) {
    sendJson(res, { error: '图片不存在' }, 404);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'no-store'
  });
  res.end(await readFile(filePath));
}

function nowTime(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}****${key.slice(-2)}`;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function sanitizeText(text: unknown): string {
  let value = String(text ?? '');
  if (currentConfig.imageApiKey) {
    value = value.split(currentConfig.imageApiKey).join(maskKey(currentConfig.imageApiKey));
  }
  return value.replace(/\b(sk-[A-Za-z0-9_-]{8,}|key-[A-Za-z0-9_-]{8,})\b/g, (matched) => maskKey(matched));
}

function addLog(level: LogLevel, scope: string, message: unknown): void {
  logs = [
    ...logs,
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: nowTime(),
      level,
      scope,
      message: sanitizeText(message)
    }
  ].slice(-200);
  adminWindow?.webContents.send('logs:update', logs);
}

function broadcastConfig(): void {
  adminWindow?.webContents.send('config:update', toConfigView(currentConfig));
  petWindow?.webContents.send('config:update', toConfigView(currentConfig));
}

function broadcastAssets(status: AssetStatus): void {
  adminWindow?.webContents.send('assets:update', status);
  petWindow?.webContents.send('assets:update', status);
}

function broadcastGeneration(): void {
  adminWindow?.webContents.send('generation:progress', generationProgress);
}

function toConfigView(config: FullConfig): AppConfigView {
  return {
    imageApiBaseUrl: config.imageApiBaseUrl,
    imageModel: config.imageModel,
    petBaseImage: config.petBaseImage,
    generatedDir: config.generatedDir,
    showBubble: config.showBubble,
    showThinkingPath: config.showThinkingPath,
    petScale: config.petScale,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: config.skipTaskbar,
    hasApiKey: Boolean(config.imageApiKey),
    apiKeyMasked: maskKey(config.imageApiKey),
    configPath,
    secureStorage: safeStorage.isEncryptionAvailable()
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileUrl(filePath: string): Promise<string> {
  const fileStat = await stat(filePath);
  return `${pathToFileURL(filePath).toString()}?v=${fileStat.mtimeMs}`;
}

async function ensureProjectDirs(): Promise<void> {
  await mkdir(generatedDir, { recursive: true });
  await mkdir(path.dirname(configPath), { recursive: true });
}

function encryptKey(key: string): Pick<StoredConfig, 'imageApiKeyEncrypted' | 'imageApiKeyPlain' | 'imageApiKeyStorage'> {
  if (!key) {
    return {
      imageApiKeyEncrypted: '',
      imageApiKeyPlain: '',
      imageApiKeyStorage: safeStorage.isEncryptionAvailable() ? 'safeStorage' : 'plain'
    };
  }

  if (safeStorage.isEncryptionAvailable()) {
    return {
      imageApiKeyEncrypted: safeStorage.encryptString(key).toString('base64'),
      imageApiKeyPlain: '',
      imageApiKeyStorage: 'safeStorage'
    };
  }

  return {
    imageApiKeyEncrypted: '',
    imageApiKeyPlain: key,
    imageApiKeyStorage: 'plain'
  };
}

function decryptKey(stored: StoredConfig): string {
  if (stored.imageApiKeyStorage === 'safeStorage' && stored.imageApiKeyEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.imageApiKeyEncrypted, 'base64'));
    } catch {
      addLog('warn', '配置', 'API Key 解密失败，请重新填写 API Key');
      return '';
    }
  }
  return stored.imageApiKeyPlain ?? '';
}

async function loadConfig(): Promise<FullConfig> {
  await ensureProjectDirs();
  try {
    const raw = await readFile(configPath, 'utf-8');
    const stored = JSON.parse(raw) as StoredConfig;
    return {
      ...defaultConfig,
      ...stored,
      imageApiKey: decryptKey(stored),
      petBaseImage: defaultConfig.petBaseImage,
      generatedDir: defaultConfig.generatedDir
    };
  } catch {
    return { ...defaultConfig };
  }
}

async function persistConfig(config: FullConfig): Promise<void> {
  const stored: StoredConfig = {
    imageApiBaseUrl: config.imageApiBaseUrl.trim(),
    imageModel: config.imageModel.trim() || defaultConfig.imageModel,
    petBaseImage: defaultConfig.petBaseImage,
    generatedDir: defaultConfig.generatedDir,
    showBubble: config.showBubble,
    showThinkingPath: config.showThinkingPath,
    petScale: config.petScale,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: config.skipTaskbar,
    ...encryptKey(config.imageApiKey)
  };
  await writeFile(configPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf-8');
}

async function getAssetStatus(): Promise<AssetStatus> {
  await ensureProjectDirs();
  const baseExists = await fileExists(baseImagePath);
  const baseUrl = baseExists ? await fileUrl(baseImagePath) : '';
  const actions = await Promise.all(
    PET_ACTIONS.map(async (action) => {
      const actionPath = path.join(generatedDir, `${action}.png`);
      const exists = await fileExists(actionPath);
      return {
        action,
        label: ACTION_LABELS[action],
        fileName: `${action}.png`,
        filePath: actionPath,
        fileUrl: exists ? await fileUrl(actionPath) : baseUrl,
        exists,
        usesBaseFallback: !exists && baseExists
      };
    })
  );

  return {
    base: {
      relativePath: defaultConfig.petBaseImage,
      filePath: baseImagePath,
      fileUrl: baseUrl,
      exists: baseExists
    },
    generatedDir,
    actions
  };
}

async function getBrowserAssetStatus(): Promise<AssetStatus> {
  const status = await getAssetStatus();
  const version = Date.now();
  return {
    ...status,
    base: {
      ...status.base,
      fileUrl: status.base.exists ? `${controlBaseUrl}/asset/base?v=${version}` : ''
    },
    actions: status.actions.map((asset) => ({
      ...asset,
      fileUrl: asset.exists
        ? `${controlBaseUrl}/asset/generated/${asset.fileName}?v=${version}`
        : status.base.exists
          ? `${controlBaseUrl}/asset/base?v=${version}`
          : ''
    }))
  };
}

async function saveBaseImageAsPng(sourcePath: string): Promise<void> {
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) {
    throw new Error('选中的文件不是可读取的图片，请换一张 PNG、JPG 或 JPEG 图片');
  }

  await ensureProjectDirs();
  await writeFile(baseImagePath, image.toPNG());
}

function loadRoute(route: 'admin' | 'pet', win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#/${route}`);
    return;
  }
  win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: `/${route}` });
}

async function createAdminWindow(): Promise<void> {
  adminWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    title: '森屿桌宠 - 后台工具',
    frame: false,
    backgroundColor: '#f8f5ec',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  adminWindow.on('closed', () => {
    adminWindow = null;
  });
  adminWindow.once('ready-to-show', () => adminWindow?.show());
  loadRoute('admin', adminWindow);
}

function applyPetWindowPreferences(): void {
  if (!petWindow) return;
  petWindow.setAlwaysOnTop(currentConfig.alwaysOnTop, 'floating');
  petWindow.setSkipTaskbar(currentConfig.skipTaskbar);
  const width = Math.round(330 * currentConfig.petScale);
  const height = Math.round(430 * currentConfig.petScale);
  const bounds = petWindow.getBounds();
  petWindow.setBounds({ ...bounds, width, height });
}

async function createPetWindow(): Promise<void> {
  const display = screen.getPrimaryDisplay();
  const width = Math.round(330 * currentConfig.petScale);
  const height = Math.round(430 * currentConfig.petScale);
  const x = display.workArea.x + display.workArea.width - width - 44;
  const y = display.workArea.y + display.workArea.height - height - 36;

  petWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: currentConfig.alwaysOnTop,
    skipTaskbar: currentConfig.skipTaskbar,
    resizable: false,
    movable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.on('closed', () => {
    petWindow = null;
  });
  petWindow.on('show', () => adminWindow?.webContents.send('pet:visibility', true));
  petWindow.on('hide', () => adminWindow?.webContents.send('pet:visibility', false));
  petWindow.webContents.on('context-menu', () => showPetContextMenu());
  petWindow.once('ready-to-show', () => petWindow?.show());
  loadRoute('pet', petWindow);
}

function showPetContextMenu(): void {
  if (!petWindow) return;
  const sizeItems = [0.8, 1, 1.25, 1.5].map((scale) => ({
    label: `${Math.round(scale * 100)}%`,
    type: 'radio' as const,
    checked: Math.abs(currentConfig.petScale - scale) < 0.01,
    click: async () => {
      currentConfig = { ...currentConfig, petScale: scale };
      await persistConfig(currentConfig);
      applyPetWindowPreferences();
      broadcastConfig();
      addLog('info', '桌宠', `桌宠大小已调整为 ${Math.round(scale * 100)}%`);
    }
  }));

  const actionItems = PET_ACTIONS.map((action) => ({
    label: `${ACTION_LABELS[action]} (${action})`,
    click: () => petWindow?.webContents.send('pet:force-action', action)
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: petWindow.isVisible() ? '隐藏桌宠' : '显示桌宠',
      click: () => {
        if (!petWindow) return;
        if (petWindow.isVisible()) petWindow.hide();
        else petWindow.show();
      }
    },
    { label: '打开后台工具', click: () => showAdminWindow() },
    { type: 'separator' },
    { label: '切换动作', submenu: actionItems },
    { label: '调整大小', submenu: sizeItems },
    {
      label: '重新生成动作图',
      click: async () => {
        const result = await dialog.showMessageBox(petWindow!, {
          type: 'question',
          buttons: ['确认生成', '取消'],
          defaultId: 1,
          cancelId: 1,
          title: '确认发送到第三方 API',
          message: '生成动作图会把原始角色图发送到你填写的第三方生图 API。',
          detail: '请确认 API URL 和 API Key 来自可信服务，且你接受可能产生的调用费用。'
        });
        if (result.response === 0) await generateActions(PET_ACTIONS);
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  menu.popup({ window: petWindow });
}

function showAdminWindow(): void {
  if (!adminWindow) {
    void createAdminWindow();
    return;
  }
  adminWindow.show();
  adminWindow.focus();
}

function buildApiUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

async function testImageApi(input: ApiTestInput): Promise<ApiTestResult> {
  const baseUrl = input.imageApiBaseUrl.trim() || currentConfig.imageApiBaseUrl.trim();
  const apiKey = input.imageApiKey?.trim() || currentConfig.imageApiKey;
  if (!baseUrl || !apiKey) {
    return { ok: false, message: '请先填写 API URL 和 API Key' };
  }

  try {
    addLog('info', 'API', `正在测试连接：${baseUrl}，Key：${maskKey(apiKey)}`);
    const response = await fetch(buildApiUrl(baseUrl, 'models'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const body = await response.text();
    if (!response.ok) {
      const message = `连接失败：HTTP ${response.status} ${sanitizeText(body).slice(0, 220)}`;
      addLog('error', 'API', message);
      return { ok: false, message };
    }
    addLog('success', 'API', 'API 连接测试成功');
    return { ok: true, message: 'API 连接测试成功' };
  } catch (error) {
    const message = `连接失败：${sanitizeText(error instanceof Error ? error.message : error)}`;
    addLog('error', 'API', message);
    return { ok: false, message };
  }
}

async function extractGeneratedImage(responseJson: unknown, outputPath: string): Promise<void> {
  const data = responseJson as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = data.data?.[0];
  if (!first) throw new Error('接口没有返回图片数据');

  if (first.b64_json) {
    await writeFile(outputPath, Buffer.from(first.b64_json, 'base64'));
    return;
  }

  if (first.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error(`图片下载失败：HTTP ${imageResponse.status}`);
    await writeFile(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
    return;
  }

  throw new Error('接口返回格式里没有 b64_json 或 url');
}

function isGeneratedBackgroundPixel(data: Buffer, index: number): boolean {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const a = data[index + 3];

  if (a === 0) return true;
  if (r > 238 && g > 238 && b > 238) return true;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const isNeutral = max - min < 12;

  // Some image APIs return a fake checkerboard instead of real alpha.
  if (isNeutral && r >= 212 && r <= 239 && g >= 212 && g <= 239 && b >= 212 && b <= 239) return true;

  // Soft off-white background pixels around the subject.
  return max - min < 28 && r > 228 && g > 225 && b > 218;
}

async function removeGeneratedBackground(imagePath: string): Promise<void> {
  const png = PNG.sync.read(await readFile(imagePath));
  const { width, height, data } = png;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) return;
    if (!isGeneratedBackgroundPixel(data, pixelIndex * 4)) return;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    add(0, y);
    add(width - 1, y);
  }

  while (head < tail) {
    const pixelIndex = queue[head++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    add(x + 1, y);
    add(x - 1, y);
    add(x, y + 1);
    add(x, y - 1);
  }

  let transparentCount = 0;
  for (let pixelIndex = 0; pixelIndex < total; pixelIndex += 1) {
    if (visited[pixelIndex]) {
      data[pixelIndex * 4 + 3] = 0;
      transparentCount += 1;
    }
  }

  if (transparentCount > 0) {
    await writeFile(imagePath, PNG.sync.write(png));
  }
}

async function callImageApi(action: PetAction, useReferenceImage: boolean): Promise<void> {
  const baseUrl = currentConfig.imageApiBaseUrl.trim();
  const apiKey = currentConfig.imageApiKey.trim();
  const outputPath = path.join(generatedDir, `${action}.png`);

  if (!baseUrl || !apiKey) throw new Error('未配置生图 API，当前使用原始图运行基础桌宠功能');
  if (!(await fileExists(baseImagePath))) throw new Error('未找到 assets/pets/senyu_base.png');

  const endpoint = useReferenceImage ? 'images/edits' : 'images/generations';
  const prompt = buildActionPrompt(action, useReferenceImage);

  if (useReferenceImage) {
    const imageBuffer = await readFile(baseImagePath);
    const form = new FormData();
    form.append('model', currentConfig.imageModel);
    form.append('prompt', prompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('image', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'senyu_base.png');

    const response = await fetch(buildApiUrl(baseUrl, endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`参考图生成失败：HTTP ${response.status} ${sanitizeText(text).slice(0, 260)}`);
    }
    await extractGeneratedImage(JSON.parse(text), outputPath);
    await removeGeneratedBackground(outputPath);
    return;
  }

  const response = await fetch(buildApiUrl(baseUrl, endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: currentConfig.imageModel,
      prompt,
      n: 1,
      size: '1024x1024'
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`文本生成失败：HTTP ${response.status} ${sanitizeText(text).slice(0, 260)}`);
  }
  await extractGeneratedImage(JSON.parse(text), outputPath);
  await removeGeneratedBackground(outputPath);
}

async function generateActions(actions: PetAction[]): Promise<GenerationProgress> {
  if (generationProgress.running) return generationProgress;

  generationProgress = {
    running: true,
    currentAction: null,
    completed: 0,
    total: actions.length,
    statusText: '准备生成',
    lastError: ''
  };
  broadcastGeneration();

  try {
    for (const action of actions) {
      generationProgress = {
        ...generationProgress,
        currentAction: action,
        statusText: `正在生成 ${ACTION_LABELS[action]} (${action})`
      };
      broadcastGeneration();
      addLog('info', '生图', `开始生成 ${action}.png`);

      try {
        await callImageApi(action, true);
      } catch (editError) {
        addLog('warn', '生图', `${ACTION_LABELS[action]}：参考图接口不可用，尝试文本生成。${sanitizeText(editError instanceof Error ? editError.message : editError)}`);
        await callImageApi(action, false);
      }

      generationProgress = {
        ...generationProgress,
        completed: generationProgress.completed + 1,
        statusText: `${ACTION_LABELS[action]} 已生成`
      };
      addLog('success', '生图', `${action}.png 已保存`);
      const assets = await getBrowserAssetStatus();
      broadcastAssets(assets);
      broadcastGeneration();
    }

    generationProgress = {
      ...generationProgress,
      running: false,
      currentAction: null,
      statusText: '动作图生成完成'
    };
    addLog('success', '生图', '全部动作图生成完成');
  } catch (error) {
    generationProgress = {
      ...generationProgress,
      running: false,
      currentAction: null,
      statusText: '生成失败',
      lastError: sanitizeText(error instanceof Error ? error.message : error)
    };
    addLog('error', '生图', generationProgress.lastError);
  }

  broadcastGeneration();
  return generationProgress;
}

async function buildSnapshot(): Promise<AppSnapshot> {
  return {
    config: toConfigView(currentConfig),
    assets: await getBrowserAssetStatus(),
    logs,
    traces,
    generation: generationProgress,
    petVisible: Boolean(petWindow?.isVisible()),
    currentPetState
  };
}

async function buildBrowserSnapshot(): Promise<AppSnapshot> {
  return {
    ...(await buildSnapshot()),
    assets: await getBrowserAssetStatus()
  };
}

function registerIpc(): void {
  ipcMain.handle('app:get-snapshot', () => buildSnapshot());
  ipcMain.handle('config:save', async (_event, input: SaveConfigInput) => {
    currentConfig = {
      ...currentConfig,
      imageApiBaseUrl: input.imageApiBaseUrl.trim(),
      imageApiKey: input.imageApiKey?.trim() || currentConfig.imageApiKey,
      imageModel: input.imageModel.trim() || defaultConfig.imageModel,
      showBubble: input.showBubble,
      showThinkingPath: input.showThinkingPath,
      petScale: input.petScale,
      alwaysOnTop: input.alwaysOnTop,
      skipTaskbar: input.skipTaskbar
    };
    await persistConfig(currentConfig);
    applyPetWindowPreferences();
    broadcastConfig();
    addLog('success', '配置', `配置已保存。Key：${maskKey(currentConfig.imageApiKey) || '未填写'}`);
    return toConfigView(currentConfig);
  });
  ipcMain.handle('config:clear', async () => {
    currentConfig = { ...defaultConfig };
    await persistConfig(currentConfig);
    applyPetWindowPreferences();
    broadcastConfig();
    addLog('warn', '配置', '本地 API 配置已清除');
    return toConfigView(currentConfig);
  });
  ipcMain.handle('api:test', (_event, input: ApiTestInput) => testImageApi(input));
  ipcMain.handle('assets:refresh', () => getBrowserAssetStatus());
  ipcMain.handle('assets:open-folder', async () => {
    await ensureProjectDirs();
    await shell.openPath(petsDir);
  });
  ipcMain.handle('assets:open-generated-folder', async () => {
    await ensureProjectDirs();
    await shell.openPath(generatedDir);
  });
  ipcMain.handle('assets:choose-base-image', async () => {
    const openOptions: Electron.OpenDialogOptions = {
      title: '选择森屿原始角色图',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }]
    };
    const result = adminWindow
      ? await dialog.showOpenDialog(adminWindow, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (result.canceled || !result.filePaths[0]) return getBrowserAssetStatus();

    if (await fileExists(baseImagePath)) {
      const messageOptions: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: ['确认替换', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '确认替换原始角色图',
        message: '这会覆盖 assets/pets/senyu_base.png。',
        detail: '请确认新图片是你希望作为森屿唯一角色基准图的文件。'
      };
      const confirm = adminWindow
        ? await dialog.showMessageBox(adminWindow, messageOptions)
        : await dialog.showMessageBox(messageOptions);
        if (confirm.response !== 0) return getBrowserAssetStatus();
    }

    try {
      await saveBaseImageAsPng(result.filePaths[0]);
    } catch (error) {
      const message = sanitizeText(error instanceof Error ? error.message : error);
      addLog('error', '资源', message);
      const errorOptions: Electron.MessageBoxOptions = {
        type: 'error',
        title: '图片读取失败',
        message
      };
      if (adminWindow) await dialog.showMessageBox(adminWindow, errorOptions);
      else await dialog.showMessageBox(errorOptions);
      return getBrowserAssetStatus();
    }

    addLog('success', '资源', '原始角色图已更新：assets/pets/senyu_base.png');
    const assets = await getBrowserAssetStatus();
    broadcastAssets(assets);
    return assets;
  });
  ipcMain.handle('generation:generate-all', () => generateActions(PET_ACTIONS));
  ipcMain.handle('generation:generate-one', (_event, action: PetAction) => generateActions([action]));
  ipcMain.handle('pet:show', () => {
    petWindow?.show();
    petWindow?.focus();
  });
  ipcMain.handle('pet:hide', () => petWindow?.hide());
  ipcMain.handle('app:exit', () => app.quit());
  ipcMain.handle('admin:show', () => showAdminWindow());
  ipcMain.handle('pet:trigger-state', (_event, state: InteractionState) => {
    petWindow?.webContents.send('pet:trigger-state', state);
    addLog('info', '状态机', `后台测试状态：${state}`);
  });
  ipcMain.handle('pet:force-action', (_event, action: PetAction) => {
    petWindow?.webContents.send('pet:force-action', action);
    addLog('info', '动作', `应用测试动作：${action}`);
  });
  ipcMain.handle('trace:add', (_event, trace: ThoughtTrace) => {
    traces = [...traces, trace].slice(-100);
    adminWindow?.webContents.send('traces:update', traces);
    addLog('info', '状态路径', `${trace.fromState} -> ${trace.toState}：${trace.reason}`);
  });
  ipcMain.handle('trace:clear', () => {
    traces = [];
    adminWindow?.webContents.send('traces:update', traces);
    addLog('warn', '状态路径', '思考路径记录已清空');
  });
  ipcMain.handle('trace:export', async () => {
    const saveOptions: Electron.SaveDialogOptions = {
      title: '导出思考路径 JSON',
      defaultPath: `senyu-thinking-path-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    };
    const result = adminWindow
      ? await dialog.showSaveDialog(adminWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) return '';
    await writeFile(result.filePath, `${JSON.stringify(traces, null, 2)}\n`, 'utf-8');
    addLog('success', '状态路径', `已导出 JSON：${result.filePath}`);
    return result.filePath;
  });
  ipcMain.handle('logs:clear', () => {
    logs = [];
    adminWindow?.webContents.send('logs:update', logs);
  });
  ipcMain.handle('logs:copy', () => {
    clipboard.writeText(logs.map((log) => `[${log.time}] [${log.level}] [${log.scope}] ${log.message}`).join('\n'));
    addLog('success', '日志', '日志已复制到剪贴板');
  });
  ipcMain.handle('pet:state-changed', (_event, state: InteractionState) => {
    currentPetState = state;
    adminWindow?.webContents.send('pet:state', state);
  });
  ipcMain.handle('pet:drag-start', () => {
    if (!petWindow) return;
    dragState = {
      cursor: screen.getCursorScreenPoint(),
      bounds: petWindow.getBounds()
    };
  });
  ipcMain.on('pet:drag-move', () => {
    if (!petWindow || !dragState) return;
    const cursor = screen.getCursorScreenPoint();
    petWindow.setBounds({
      ...dragState.bounds,
      x: dragState.bounds.x + cursor.x - dragState.cursor.x,
      y: dragState.bounds.y + cursor.y - dragState.cursor.y
    });
  });
  ipcMain.handle('pet:drag-end', () => {
    dragState = null;
  });
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === adminWindow) win?.hide();
    else win?.close();
  });
}

function startControlServer(): void {
  const server = createServer(async (req, res) => {
    try {
      if (!setControlHeaders(req, res)) return;
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', controlBaseUrl);
      const route = `${req.method ?? 'GET'} ${url.pathname}`;

      if (route === 'GET /snapshot') return sendJson(res, await buildBrowserSnapshot());
      if (route === 'GET /assets/refresh') return sendJson(res, await getBrowserAssetStatus());
      if (route === 'GET /asset/base') return sendPng(res, baseImagePath);
      if (req.method === 'GET' && url.pathname.startsWith('/asset/generated/')) {
        const fileName = path.basename(decodeURIComponent(url.pathname.replace('/asset/generated/', '')));
        return sendPng(res, path.join(generatedDir, fileName));
      }

      if (route === 'POST /config/save') {
        const input = await readJsonBody<SaveConfigInput>(req);
        currentConfig = {
          ...currentConfig,
          imageApiBaseUrl: input.imageApiBaseUrl.trim(),
          imageApiKey: input.imageApiKey?.trim() || currentConfig.imageApiKey,
          imageModel: input.imageModel.trim() || defaultConfig.imageModel,
          showBubble: input.showBubble,
          showThinkingPath: input.showThinkingPath,
          petScale: input.petScale,
          alwaysOnTop: input.alwaysOnTop,
          skipTaskbar: input.skipTaskbar
        };
        await persistConfig(currentConfig);
        applyPetWindowPreferences();
        broadcastConfig();
        addLog('success', '配置', `配置已保存。Key：${maskKey(currentConfig.imageApiKey) || '未填写'}`);
        return sendJson(res, toConfigView(currentConfig));
      }

      if (route === 'POST /config/clear') {
        currentConfig = { ...defaultConfig };
        await persistConfig(currentConfig);
        applyPetWindowPreferences();
        broadcastConfig();
        addLog('warn', '配置', '本地 API 配置已清除');
        return sendJson(res, toConfigView(currentConfig));
      }

      if (route === 'POST /api/test') return sendJson(res, await testImageApi(await readJsonBody<ApiTestInput>(req)));
      if (route === 'POST /assets/open-folder') {
        await ensureProjectDirs();
        await shell.openPath(petsDir);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /assets/open-generated-folder') {
        await ensureProjectDirs();
        await shell.openPath(generatedDir);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /assets/choose-base-image') return sendJson(res, await getBrowserAssetStatus());
      if (route === 'POST /generation/generate-all') return sendJson(res, await generateActions(PET_ACTIONS));
      if (route === 'POST /generation/generate-one') {
        const body = await readJsonBody<{ action: PetAction }>(req);
        return sendJson(res, await generateActions([body.action]));
      }
      if (route === 'POST /pet/show') {
        petWindow?.show();
        petWindow?.focus();
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /pet/hide') {
        petWindow?.hide();
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /app/exit') {
        sendJson(res, { ok: true });
        app.quit();
        return;
      }
      if (route === 'POST /admin/show') {
        showAdminWindow();
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /pet/trigger-state') {
        const body = await readJsonBody<{ state: InteractionState }>(req);
        petWindow?.webContents.send('pet:trigger-state', body.state);
        addLog('info', '状态机', `浏览器测试状态：${body.state}`);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /pet/force-action') {
        const body = await readJsonBody<{ action: PetAction }>(req);
        petWindow?.webContents.send('pet:force-action', body.action);
        addLog('info', '动作', `浏览器应用测试动作：${body.action}`);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /trace/add') {
        const trace = await readJsonBody<ThoughtTrace>(req);
        traces = [...traces, trace].slice(-100);
        adminWindow?.webContents.send('traces:update', traces);
        addLog('info', '状态路径', `${trace.fromState} -> ${trace.toState}：${trace.reason}`);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /trace/clear') {
        traces = [];
        adminWindow?.webContents.send('traces:update', traces);
        addLog('warn', '状态路径', '思考路径记录已清空');
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /trace/export') return sendJson(res, { filePath: '' });
      if (route === 'POST /logs/clear') {
        logs = [];
        adminWindow?.webContents.send('logs:update', logs);
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /logs/copy') {
        clipboard.writeText(logs.map((log) => `[${log.time}] [${log.level}] [${log.scope}] ${log.message}`).join('\n'));
        addLog('success', '日志', '日志已复制到剪贴板');
        return sendJson(res, { ok: true });
      }
      if (route === 'POST /pet/state-changed') {
        const body = await readJsonBody<{ state: InteractionState }>(req);
        currentPetState = body.state;
        adminWindow?.webContents.send('pet:state', body.state);
        return sendJson(res, { ok: true });
      }

      return sendJson(res, { error: '未知的本机接口' }, 404);
    } catch (error) {
      return sendJson(res, { error: sanitizeText(error instanceof Error ? error.message : error) }, 500);
    }
  });

  server.listen(controlPort, '127.0.0.1', () => {
    addLog('success', '前端', `浏览器预览接口已启动：${controlBaseUrl}`);
  });
  server.on('error', (error) => {
    addLog('warn', '前端', `浏览器预览接口启动失败：${sanitizeText(error.message)}`);
  });
}

app.setName('森屿桌宠');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showAdminWindow();
    petWindow?.show();
    petWindow?.focus();
  });

  app.whenReady().then(async () => {
    currentConfig = await loadConfig();
    registerIpc();
    startControlServer();
    await createAdminWindow();
    await createPetWindow();
    const assets = await getAssetStatus();
    if (!assets.base.exists) {
      addLog('warn', '资源', '未找到 assets/pets/senyu_base.png，桌宠将显示占位状态');
    }
    if (!currentConfig.imageApiBaseUrl || !currentConfig.imageApiKey) {
      addLog('warn', 'API', '未配置生图 API，当前使用原始图运行基础桌宠功能');
    }
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createAdminWindow();
    void createPetWindow();
  } else {
    showAdminWindow();
  }
});

app.on('window-all-closed', () => {});
