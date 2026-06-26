import assert from 'node:assert/strict';
import { MentionResolverService } from './mention-resolver.service.js';
import type { MentionAliasConfig } from './types.js';
import {
  extractNaturalMentionLabels,
  extractUuidMentions,
  hasCeoAliasMention,
} from './mention-resolver.util.js';

const resolver = new MentionResolverService();

const candidates = [
  { agentId: 'a1', name: 'Finance Director', role: 'director', organizationNodeId: 'n-fin' },
  { agentId: 'a2', name: 'Engineering Director', role: 'director', organizationNodeId: 'n-eng' },
  { agentId: 'a3', name: 'Marketing Director', role: 'director', organizationNodeId: 'n-mkt' },
  { agentId: 'a4', name: '营销总监', role: 'director', organizationNodeId: 'n-mkt-zh' },
  { agentId: 'a5', name: 'Sales Director（销售总监）', role: 'director', organizationNodeId: 'n-sales' },
];

/** 模拟管理后台为公司配置的提及别名（职务/口语 → Agent） */
const configuredZhTitles: MentionAliasConfig[] = [
  { label: '财务总监', nodeType: 'title', targetAgentIds: ['a1'] },
  { label: '技术总监', nodeType: 'title', targetAgentIds: ['a2'] },
  { label: '市场总监', nodeType: 'title', targetAgentIds: ['a3'] },
];

const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
assert.deepEqual(extractUuidMentions(`@${uuid}`), [uuid]);
assert.equal(hasCeoAliasMention('请 @CEO 处理'), true);
assert.equal(hasCeoAliasMention('hello'), false);
assert.deepEqual(extractNaturalMentionLabels('@Finance Director hi'), ['Finance Director']);
assert.deepEqual(extractNaturalMentionLabels('请 @营销总监 看下'), ['营销总监']);

assert.deepEqual(
  resolver.resolveMentions({ content: `@${uuid}`, candidates }).agentIds,
  [uuid],
);
assert.equal(
  resolver.resolveMentions({ content: '@CEO hello', candidates, ceoAgentId: 'ceo-1' }).agentIds[0],
  'ceo-1',
);
assert.equal(
  resolver.resolveMentions({ content: '@Finance Director please', candidates }).agentIds[0],
  'a1',
);
assert.equal(
  resolver.resolveMentions({ content: '@Engineering Director please', candidates }).nodeIds[0],
  'n-eng',
);
assert.equal(
  resolver.resolveMentions({ content: '@Marketing Director please', candidates }).agentIds[0],
  'a3',
);
assert.equal(
  resolver.resolveMentions({ content: '@营销总监 请进群', candidates }).agentIds[0],
  'a4',
);
assert.equal(
  resolver.resolveMentions({ content: '@财务总监 请进群', candidates, aliases: configuredZhTitles }).agentIds[0],
  'a1',
);
assert.equal(
  resolver.resolveMentions({ content: '@技术总监 请进群', candidates, aliases: configuredZhTitles }).agentIds[0],
  'a2',
);
assert.equal(
  resolver.resolveMentions({ content: '@市场总监 请进群', candidates, aliases: configuredZhTitles }).agentIds[0],
  'a3',
);
assert.equal(
  resolver.resolveMentions({ content: '让销售总监出来说话', candidates }).agentIds[0],
  'a5',
);
assert.equal(
  resolver.resolveMentions({ content: '我想和销售总监聊聊', candidates }).agentIds[0],
  'a5',
);
assert.equal(
  resolver.resolveMentions({
    content: '@Sales Director 请回复',
    candidates: [
      {
        agentId: 'sd-1',
        name: 'Alex',
        role: 'rep',
        expertise: 'sales director coverage and regional quotas',
        organizationNodeId: null,
      },
    ],
  }).agentIds[0],
  'sd-1',
);
assert.equal(
  resolver.resolveMentions({
    content: 'please ask sales director to reply',
    candidates,
    aliases: [{ label: 'sales director', nodeType: 'title', targetAgentIds: ['a5'] }],
  }).agentIds[0],
  'a5',
);
assert.deepEqual(resolver.resolveMentions({ content: 'no mention', candidates }).agentIds, []);

console.log('mention-resolver.spec passed');
