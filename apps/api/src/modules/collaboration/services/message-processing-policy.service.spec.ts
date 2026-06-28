import { MessageProcessingPolicyService } from './message-processing-policy.service.js';

describe('MessageProcessingPolicyService', () => {
  const service = new MessageProcessingPolicyService();

  it('marks explicit task messages as task intent', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: { messageCategory: 'task_publish' },
      content: '请处理这个任务',
    });

    expect(profile.hasTaskIntent).toBe(true);
  });

  it('does not infer task intent from plain task words without explicit intake', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: {},
      content: '这个任务我们先讨论一下，不要开始执行',
    });

    expect(profile.hasTaskIntent).toBe(false);
    expect(profile.processingMode).toBe('discussion');
  });

  it('treats blank punctuation as noise', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: {},
      content: '   ...   ',
    });

    expect(profile.messageKind).toBe('noise');
    expect(profile.isIndexable).toBe(false);
  });

  it('detects mentions from metadata', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: { mentionedAgentIds: ['a1'] },
      content: 'ping @a1',
    });

    expect(profile.hasMentions).toBe(true);
  });

  it('keeps discussion separate from task execution', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: {},
      content: 'CEO、产品、工程一起讨论一下这个新功能值不值得做',
    });

    expect(profile.processingMode).toBe('discussion');
    expect(profile.userFacingStage).toBe('discussion_only');
    expect(profile.hasTaskIntent).toBe(false);
  });

  it('marks explicit tasks with a user-facing task stage', () => {
    const profile = service.buildSemanticProfile({
      companyId: 'c1',
      message: {} as never,
      senderType: 'human',
      messageType: 'text',
      metadata: { messageCategory: 'task_publish' },
      content: '让工程部今天修复登录验证码问题，完成后在群里汇报',
    });

    expect(profile.processingMode).toBe('task_execution');
    expect(profile.userFacingStage).toBe('task_candidate_detected');
  });
});
