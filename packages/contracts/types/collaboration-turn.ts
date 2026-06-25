import type { CollaborationProgramRecord } from './collaboration-program.js';

export type CollaborationTurnOutcome = {
  targetAgentIds: string[];
  userSurfaceText: string;
  orchestrationRan: boolean;
  routePath: string;
  roomWriteHandled: true;
  programPatch?: Partial<CollaborationProgramRecord>;
};
