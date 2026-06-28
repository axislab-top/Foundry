import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('foundry.phase2');

/** W12：跨部门协调请求出站次数（Director / Employee / L2 hook 路径）。 */
export const phase2CrossDeptCoordinationCounter = meter.createCounter('foundry.cross.dept.coordination.count', {
  description: 'cross-department.coordination.requested publications',
});

/** W12：Phase2 自主子任务（Director / Employee / cross-dept）Skill 执行完成次数。 */
export const phase2AgentAutonomousTasksCompletedCounter = meter.createCounter(
  'foundry.agent.autonomous.tasks.completed',
  {
    description: 'Pending agent tasks completed with autonomous subtask metadata',
  },
);
