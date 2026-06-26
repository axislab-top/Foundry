import { Injectable } from '@nestjs/common';
import type { DepartmentCapability } from '@contracts/types';
import { classifyPhaseTaskTypes } from '@foundry/contracts/types/department-assignment';
import { ConfigService } from '../../../common/config/config.service.js';

export interface AssignmentValidatorOptions {
  phaseTaskTypes?: string[];
  capabilities?: DepartmentCapability[];
}

/**
 * LLM 指派结果的职责校验：禁止明显违背职能的「部门 × 交付物」映射。
 */
@Injectable()
export class CollaborationAssignmentValidatorService {
  constructor(private readonly config: ConfigService) {}

  isAssignable(deliverable: string, departmentSlug: string, opts?: AssignmentValidatorOptions): boolean {
    if (!this.config.isCollabAssignmentValidatorEnabled()) return true;
    const dept = String(departmentSlug ?? '').trim();
    const text = String(deliverable ?? '');
    if (!dept || !text) return true;

    const phaseTypes =
      opts?.phaseTaskTypes ??
      (text ? classifyPhaseTaskTypes(text.split('\n')[0] ?? '', text) : []);
    const cap = opts?.capabilities?.find((c) => c.slug === dept);
    if (cap && phaseTypes.length) {
      const ex = new Set(cap.excludesTaskTypeTags ?? []);
      if (phaseTypes.some((t) => ex.has(t))) return false;
      const tags = new Set(cap.taskTypeTags ?? []);
      if (tags.size > 0 && !phaseTypes.some((t) => tags.has(t))) return false;
    }

    if (this.growthDeliverableMustNotFinance(text, dept)) return false;
    if (this.socialOrMarketingDeliverableMustNotHr(text, dept)) return false;
    return true;
  }

  /** 流量/线索类交付物不得指派财务部门（除非 KR 本身是财务职能）。 */
  private growthDeliverableMustNotFinance(deliverable: string, department: string): boolean {
    const d = department.toLowerCase();
    if (!/财务|finance|会计|出纳/.test(d)) return false;
    const text = String(deliverable ?? '');
    const lower = text.toLowerCase();
    const isGrowthOrMarketingMetric =
      /访问量|月活|UV|PV|自然流量|搜索引擎|线索|SQL|MQL|获客|潜客|市场认知|品牌曝光|投放效果|转化|增长指标/i.test(text) ||
      /traffic|organic|monthly\s*visitors|search\s*engine|lead\s*generation/i.test(lower);
    const isFinanceDomain =
      /预算编制|财报|审计|税务|发票|成本核算|现金流|固定资产|薪酬核算|费用报销|财务合规/i.test(text) ||
      /\baudit\b|tax\s*return|P&L|balance\s*sheet/i.test(lower);
    return isGrowthOrMarketingMetric && !isFinanceDomain;
  }

  /**
   * 推文 / 社媒 / 互动运营类不得落到人力资源职能 slug（与问题清单 #4 对齐）。
   */
  private socialOrMarketingDeliverableMustNotHr(deliverable: string, department: string): boolean {
    const d = department.toLowerCase();
    if (!/人力|人事|hr|human\s*resource|人力资源/.test(d)) return false;
    const text = String(deliverable ?? '');
    const lower = text.toLowerCase();
    const isHrDomain =
      /招聘|入职|离职|薪酬结构|绩效面谈|劳动合同|考勤|编制|hc\b|headcount|培训体系|组织发展|od\b/i.test(text) ||
      /\bonboarding\b|offboarding|payroll|performance\s*review/i.test(lower);
    const isSocialOrMarketingOps =
      /小红书|推文|笔记|新媒体|社媒|互动|评论区|种草|kol|达人|投放素材|短视频|直播带货|公众号/i.test(text) ||
      /xiaohongshu|red\s*book|social\s*media|ugc|influencer|community\s*management/i.test(lower);
    return isSocialOrMarketingOps && !isHrDomain;
  }
}
