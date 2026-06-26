/**
 * W11：跨部门协调 **宽松** 启发式（轻量；精确部门绑定可扩 RPC）。
 *
 * 注意：部门 Director / 员工自主主路径在「本部门子图与委派执行之后」应使用
 * {@link detectCrossDepartmentCoordinationEscalation}，避免仅凭「@ 两个组织节点」
 * 就抢先触发跨部门 L2、跳过本部门自闭环。
 */
export function detectCrossDepartmentCoordinationNeed(params: {
  contentText: string;
  mentionedNodeIds?: string[];
}): boolean {
  const nodes = new Set(
    (params.mentionedNodeIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean),
  );
  if (nodes.size >= 2) {
    return true;
  }
  return /跨部门|cross-department|cross\s*dept|crossDept/i.test(String(params.contentText ?? ''));
}

const EXPLICIT_CROSS_DEPT_PHRASE = /跨部门|cross-department|cross\s*dept|crossDept/i;

/** 正文含跨部门升级/对齐诉求时，与「多组织节点 @」同时成立才视为升级。 */
const COORD_ESCALATION_SIGNAL =
  /协助|依赖|同步|对齐|卡点|blocked|需要[^\n]{0,16}部门|请[^\n]{0,16}部门|部门间协调|协调请求|升级|escalat/i;

/**
 * **延后**跨部门协调门闸：显式跨部门用语，或「≥2 个组织节点 @」且正文带协调/依赖类信号。
 * 调用方应先跑完本部门子图与委派，再调用本函数决定是否触发 `cross-department.coordination.requested`。
 */
export function detectCrossDepartmentCoordinationEscalation(params: {
  contentText: string;
  mentionedNodeIds?: string[];
}): boolean {
  const text = String(params.contentText ?? '');
  if (EXPLICIT_CROSS_DEPT_PHRASE.test(text)) {
    return true;
  }
  const nodes = new Set(
    (params.mentionedNodeIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean),
  );
  if (nodes.size >= 2 && COORD_ESCALATION_SIGNAL.test(text)) {
    return true;
  }
  return false;
}

/** 与契约路由键对齐（避免 Worker 单测直接 import dist ESM） */
export const CROSS_DEPARTMENT_COORDINATION_REQUESTED_RK = 'cross-department.coordination.requested' as const;
export const CROSS_DEPARTMENT_COORDINATION_COMPLETED_RK = 'cross-department.coordination.completed' as const;
