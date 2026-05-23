import type { PetAction } from './types';

export const PET_ACTIONS: PetAction[] = [
  'idle',
  'hover',
  'touch',
  'wave',
  'sleep',
  'talk',
  'surprised',
  'drag'
];

export const ACTION_LABELS: Record<PetAction, string> = {
  idle: '待机',
  hover: '靠近',
  touch: '触碰',
  wave: '打招呼',
  sleep: '睡觉',
  talk: '说话',
  surprised: '惊讶',
  drag: '拖拽'
};

export const GENERAL_CHARACTER_PROMPT =
  '基于提供的原始角色图生成同一角色的桌宠动作图。角色名为森屿，Q版男性森林系桌宠角色，清爽、治愈、亲和，绿色、米白、浅棕配色。必须保持原角色的发型、服装、配色、脸型、整体气质一致。单角色，全身像，透明背景或纯净背景，适合桌面悬浮使用，PNG，边缘清晰，不要复杂场景，不要多角色，不要文字。';

export const ACTION_PROMPTS: Record<PetAction, string> = {
  idle: '自然站立，轻微待机感，表情温和。',
  hover: '好奇地看向用户方向，轻微歪头，表情灵动。',
  touch: '像被鼠标戳到一样，有点惊讶或害羞，轻微后退感。',
  wave: '开心打招呼，一只手挥手，表情友好。',
  sleep: '困倦或睡觉状态，安静可爱。',
  talk: '正在说话，嘴巴微张，表情自然，适合聊天气泡状态。',
  surprised: '惊讶睁大眼睛，轻微受惊但可爱。',
  drag: '像被用户拎起来或拖动，轻微紧张，可爱不夸张。'
};

export function buildActionPrompt(action: PetAction, supportsReferenceImage: boolean): string {
  const referenceLine = supportsReferenceImage
    ? '请严格参考上传的原始角色图，不要重新设计角色。'
    : '当前接口可能不支持参考图，请尽量按角色描述保持一致性。';

  return `${GENERAL_CHARACTER_PROMPT}\n${referenceLine}\n动作要求：${ACTION_PROMPTS[action]}`;
}

