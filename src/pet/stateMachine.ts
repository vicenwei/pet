import type { InteractionState, PetAction, ThoughtTrace } from '@shared/types';

export interface PetStateDefinition {
  state: InteractionState;
  triggerEvent: string;
  imageAction: PetAction;
  animation: string;
  bubbleTexts: string[];
  thinkingText: string;
  reason: string;
  durationMs: number;
  nextState: InteractionState | null;
}

export const STATE_DEFINITIONS: Record<InteractionState, PetStateDefinition> = {
  idle: {
    state: 'idle',
    triggerEvent: 'idle',
    imageAction: 'idle',
    animation: 'breathe blink',
    bubbleTexts: ['我正在待机，等你叫我。'],
    thinkingText: '待机中 → 等待互动',
    reason: '当前没有新的鼠标互动',
    durationMs: 0,
    nextState: null
  },
  hover: {
    state: 'hover',
    triggerEvent: 'mouse_hover',
    imageAction: 'hover',
    animation: 'curious',
    bubbleTexts: ['你来啦？', '需要我帮忙吗？', '别光看我，点一下试试。'],
    thinkingText: '鼠标靠近 → 好奇状态',
    reason: '鼠标进入桌宠感应区域',
    durationMs: 3000,
    nextState: 'idle'
  },
  touch: {
    state: 'touch',
    triggerEvent: 'mouse_touch',
    imageAction: 'touch',
    animation: 'dodge shake blink',
    bubbleTexts: ['欸？你碰到我了。', '有点痒。', '别戳太久啦。'],
    thinkingText: '触碰检测 → 躲避反应',
    reason: '检测到鼠标持续停留在角色身体区域',
    durationMs: 2500,
    nextState: 'idle'
  },
  click: {
    state: 'click',
    triggerEvent: 'mouse_click',
    imageAction: 'wave',
    animation: 'pop',
    bubbleTexts: ['森屿收到。', '今天也要好好工作。', '需要我提醒你什么吗？'],
    thinkingText: '点击事件 → 随机回应',
    reason: '用户点击了桌宠',
    durationMs: 2800,
    nextState: 'idle'
  },
  double_click: {
    state: 'double_click',
    triggerEvent: 'mouse_double_click',
    imageAction: 'talk',
    animation: 'pop',
    bubbleTexts: ['我把后台工具打开啦。'],
    thinkingText: '双击事件 → 打开后台',
    reason: '检测到双击，需要打开后台工具窗口',
    durationMs: 1800,
    nextState: 'idle'
  },
  drag_start: {
    state: 'drag_start',
    triggerEvent: 'drag_start',
    imageAction: 'drag',
    animation: 'lift',
    bubbleTexts: ['要带我去哪？', '轻一点轻一点。'],
    thinkingText: '拖拽开始 → 被移动状态',
    reason: '检测到用户开始拖拽桌宠窗口',
    durationMs: 450,
    nextState: 'dragging'
  },
  dragging: {
    state: 'dragging',
    triggerEvent: 'dragging',
    imageAction: 'drag',
    animation: 'balance',
    bubbleTexts: ['我在保持平衡。'],
    thinkingText: '拖拽中 → 保持平衡',
    reason: '窗口正在跟随鼠标移动',
    durationMs: 0,
    nextState: null
  },
  drag_end: {
    state: 'drag_end',
    triggerEvent: 'drag_end',
    imageAction: 'idle',
    animation: 'rebound',
    bubbleTexts: ['这里也不错。', '我就待在这啦。'],
    thinkingText: '拖拽结束 → 恢复待机',
    reason: '用户松开鼠标，拖拽结束',
    durationMs: 1800,
    nextState: 'idle'
  },
  long_idle: {
    state: 'long_idle',
    triggerEvent: 'long_idle',
    imageAction: 'sleep',
    animation: 'sleepy',
    bubbleTexts: ['我先休息一下。', '有事叫我。'],
    thinkingText: '长时间无互动 → 休息状态',
    reason: '连续几分钟没有检测到互动',
    durationMs: 0,
    nextState: null
  },
  sleep: {
    state: 'sleep',
    triggerEvent: 'sleep',
    imageAction: 'sleep',
    animation: 'sleepy',
    bubbleTexts: ['呼……'],
    thinkingText: '休息中 → 等待唤醒',
    reason: '桌宠处于休息状态',
    durationMs: 0,
    nextState: null
  },
  mouse_leave: {
    state: 'mouse_leave',
    triggerEvent: 'mouse_leave',
    imageAction: 'idle',
    animation: 'settle',
    bubbleTexts: ['我先回到原位。'],
    thinkingText: '鼠标离开 → 恢复待机',
    reason: '鼠标离开桌宠窗口',
    durationMs: 1200,
    nextState: 'idle'
  }
};

export const DEBUG_STATES: InteractionState[] = [
  'idle',
  'hover',
  'touch',
  'click',
  'double_click',
  'drag_start',
  'dragging',
  'drag_end',
  'long_idle',
  'sleep',
  'mouse_leave'
];

export function pickBubble(definition: PetStateDefinition): string {
  const choices = definition.bubbleTexts;
  return choices[Math.floor(Math.random() * choices.length)] ?? '';
}

export function pickClickAction(): PetAction {
  const choices: PetAction[] = ['wave', 'talk', 'surprised'];
  return choices[Math.floor(Math.random() * choices.length)] ?? 'wave';
}

export function createThoughtTrace(input: {
  event: string;
  fromState: InteractionState;
  toState: InteractionState;
  reason: string;
  actionImage: string;
  bubbleText: string;
  nextState: InteractionState | null;
  durationMs: number;
  shortText: string;
}): ThoughtTrace {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    ...input
  };
}

