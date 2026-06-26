import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { DirectCollabReplyService } from '../direct-collab-reply.service.js';
import { ReplyMode } from '../reply-mode.js';

const ParallelAgentDiscussionAnnotation = Annotation.Root({
  companyId: Annotation<string>,
  roomId: Annotation<string>,
  threadId: Annotation<string>,
  sourceMessageId: Annotation<string>,
  userMessage: Annotation<string>,
  agentId: Annotation<string>,
  completedAt: Annotation<string | undefined>,
});

type ParallelAgentDiscussionState = typeof ParallelAgentDiscussionAnnotation.State;

@Injectable()
export class ParallelAgentDiscussionGraph {
  private readonly logger = new Logger(ParallelAgentDiscussionGraph.name);
  constructor(private readonly directReply: DirectCollabReplyService) {}

  async runForAgent(input: {
    companyId: string;
    roomId: string;
    threadId: string;
    sourceMessageId: string;
    userMessage: string;
    agentId: string;
    /** 触发并行讨论的人类发送者；与直聊一致，经 GroupChatContextService 门控注入 */
    humanUserId?: string | null;
  }): Promise<{ agentId: string; ok: boolean; completedAt?: string; error?: string }> {
    const graph = new StateGraph(ParallelAgentDiscussionAnnotation)
      .addNode('agentReasoning', async (s: ParallelAgentDiscussionState) => {
        this.logger.warn('[L2 Context] Missing l1DecisionContext at parallel-agent-discussion.graph.runForAgent', {
          messageId: s.sourceMessageId,
        });
        await this.directReply.reply({
          companyId: s.companyId,
          roomId: s.roomId,
          threadId: s.threadId,
          sourceMessageId: s.sourceMessageId,
          userMessage: s.userMessage,
          agentId: s.agentId,
          mode: ReplyMode.STRUCTURED,
          humanUserId: input.humanUserId ?? undefined,
          replyingToCeo: false,
          l1DecisionContext: undefined,
        });
        return { completedAt: new Date().toISOString() };
      })
      .addEdge(START, 'agentReasoning')
      .addEdge('agentReasoning', END)
      .compile();

    try {
      const output = await graph.invoke({
        companyId: input.companyId,
        roomId: input.roomId,
        threadId: input.threadId,
        sourceMessageId: input.sourceMessageId,
        userMessage: input.userMessage,
        agentId: input.agentId,
        completedAt: undefined,
      });
      return { agentId: input.agentId, ok: true, completedAt: output.completedAt };
    } catch (e: unknown) {
      return {
        agentId: input.agentId,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
