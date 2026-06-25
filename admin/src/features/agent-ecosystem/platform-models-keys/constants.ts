import type { KeyStatus, ModelType } from './types';

export const MODEL_TYPE_OPTIONS: ModelType[] = [
  'chat',
  'embedding',
  'rerank',
  'image',
  'audio',
  'moderation',
  'other'
];

export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  chat: '对话',
  embedding: '向量',
  rerank: '重排',
  image: '图像',
  audio: '语音',
  moderation: '审核',
  other: '其他'
};

export const DEFAULT_SUFFIX_BY_MODEL_TYPE: Record<ModelType, string> = {
  chat: '/chat/completions',
  embedding: '/embeddings',
  rerank: '/rerank',
  image: '/images/generations',
  audio: '/audio/speech',
  moderation: '/moderations',
  other: ''
};

export const EMBEDDING_PATH_TEXT = '/embeddings';
export const EMBEDDING_PATH_MULTIMODAL = '/embeddings/multimodal';

export const EMBEDDING_PATH_OPTIONS = [
  {
    value: EMBEDDING_PATH_TEXT,
    label: '文本向量',
    desc: `${EMBEDDING_PATH_TEXT} — 平台 Memory / 纯文本 RAG（推荐）`
  },
  {
    value: EMBEDDING_PATH_MULTIMODAL,
    label: '多模态向量',
    desc: `${EMBEDDING_PATH_MULTIMODAL} — 需图文联合向量时使用`
  }
] as const;

export const STATUS_TAG: Record<KeyStatus, { color: string; text: string }> = {
  active: { color: 'success', text: '启用' },
  disabled: { color: 'default', text: '停用' }
};

export const PROVIDER_KIND_LABELS: Record<'openai' | 'anthropic', string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic'
};
