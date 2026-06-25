import { useMemo } from "react";
import { Bot, Building2, Crown, Users } from "lucide-react";
import {
  resolveAgentDisplayName,
  useMarketplaceAgentNameMap,
} from "@/features/company-wizard/hooks/useMarketplaceAgentNameMap";
import type { OrgPreviewNode } from "@/features/company-wizard/types/organizationDraft";
import styles from "../CompanyWizard.module.css";

type OrgStructurePreviewProps = {
  nodes: OrgPreviewNode[];
};

type ParsedOrgTree = {
  board: OrgPreviewNode | null;
  ceo: OrgPreviewNode | null;
  departments: Array<{
    dept: OrgPreviewNode;
    head: OrgPreviewNode | null;
    members: OrgPreviewNode[];
  }>;
  deptCount: number;
  agentCount: number;
};

function parseOrgTree(nodes: OrgPreviewNode[]): ParsedOrgTree {
  const board = nodes.find((n) => n.type === "board") ?? null;
  const ceo = nodes.find((n) => n.type === "ceo") ?? null;
  const departments = nodes
    .filter((n) => n.type === "department")
    .map((dept) => {
      const agents = nodes.filter((n) => n.parentId === dept.id && n.type === "agent");
      return {
        dept,
        head: agents.find((a) => a.roleHint === "部门主管") ?? null,
        members: agents.filter((a) => a.roleHint !== "部门主管"),
      };
    });

  const agentCount = nodes.filter((n) => n.type === "agent").length + (ceo ? 1 : 0);

  return {
    board,
    ceo,
    departments,
    deptCount: departments.length,
    agentCount,
  };
}

function AgentRow({
  node,
  nameMap,
}: {
  node: OrgPreviewNode;
  nameMap: Map<string, string>;
}) {
  const displayName = resolveAgentDisplayName(node, nameMap);
  const isHead = node.roleHint === "部门主管";

  return (
    <div className={styles.agentRow}>
      <div className={styles.agentAvatar}>
        <Bot size={14} />
      </div>
      <span className={styles.agentName}>{displayName}</span>
      {node.roleHint ? (
        <span className={`${styles.roleBadge} ${isHead ? styles.roleBadgeHead : styles.roleBadgeMember}`}>
          {node.roleHint}
        </span>
      ) : null}
    </div>
  );
}

export default function OrgStructurePreview({ nodes }: OrgStructurePreviewProps) {
  const nameMap = useMarketplaceAgentNameMap();
  const tree = useMemo(() => parseOrgTree(nodes), [nodes]);

  if (!nodes.length) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.previewEmpty}>选择蓝图后，将在此预览组织架构</div>
      </div>
    );
  }

  const ceoLabel = tree.ceo ? resolveAgentDisplayName(tree.ceo, nameMap) : "CEO";

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.previewTitle}>组织架构预览</p>
          <p className={styles.previewSubtitle}>董事会 → CEO → 各部门 Agent</p>
        </div>
        <div className={styles.previewBadges}>
          <span className={styles.previewBadge}>{tree.deptCount} 部门</span>
          <span className={styles.previewBadge}>{tree.agentCount} Agent</span>
        </div>
      </div>

      <div className={styles.previewBody}>
        <div className={styles.orgTree}>
          {tree.board ? (
            <>
              <div className={styles.orgBoard}>
                <Building2 size={14} />
                {tree.board.label}
              </div>
              <div className={styles.orgConnector} aria-hidden="true" />
            </>
          ) : null}

          {tree.ceo ? (
            <>
              <div className={styles.orgCeo}>
                <div className={styles.orgCeoIcon}>
                  <Crown size={16} />
                </div>
                <p className={styles.orgCeoName}>{ceoLabel}</p>
                {tree.ceo.roleHint ? <p className={styles.orgCeoRole}>{tree.ceo.roleHint}</p> : null}
              </div>
              {tree.departments.length > 0 ? <div className={styles.orgConnector} aria-hidden="true" /> : null}
            </>
          ) : null}

          {tree.departments.length > 0 ? (
            <div className={styles.deptList}>
              {tree.departments.map(({ dept, head, members }) => (
                <div key={dept.id} className={styles.deptCard}>
                  <div className={styles.deptHead}>
                    <div className={styles.deptIcon}>
                      <Users size={14} />
                    </div>
                    <div>
                      <p className={styles.deptName}>{dept.label}</p>
                      {dept.roleHint ? <p className={styles.deptRole}>{dept.roleHint}</p> : null}
                    </div>
                  </div>
                  <div className={styles.agentList}>
                    {head ? <AgentRow node={head} nameMap={nameMap} /> : null}
                    {members.map((member) => (
                      <AgentRow key={member.id} node={member} nameMap={nameMap} />
                    ))}
                    {!head && members.length === 0 ? (
                      <p className={styles.previewEmpty} style={{ minHeight: 48 }}>
                        暂未分配 Agent
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
