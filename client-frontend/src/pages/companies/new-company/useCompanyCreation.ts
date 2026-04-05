import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import {
  completeCompanyWizard,
  type Company,
  type CreateCompanyPayload,
  type RecommendedDepartmentPlacement,
} from '../../../services/companiesApi';
import { listAgents, updateAgent } from '../../../services/agentsApi';
import { companySession } from '../../../services/companySession';
import { useCompany } from '../../../contexts/CompanyContext';
import type { NewCompanyDraft } from '../../../stores/newCompanyStore';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';
import { COMPANY_INDUSTRY_PRESETS } from '@contracts/types';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildCreatePayload(
  draft: NewCompanyDraft,
  departmentPlacements: RecommendedDepartmentPlacement[] | null,
): CreateCompanyPayload {
  const preset = COMPANY_INDUSTRY_PRESETS.find((p) => p.code === draft.industryCode);
  const industryLabel = preset?.labelZh;
  let budget = draft.initialBudget;
  if (draft.budgetCurrency === 'USD') {
    budget = Math.round(draft.initialBudget * 7.2);
  }
  const payload: CreateCompanyPayload = {
    name: draft.name.trim(),
    industry: industryLabel,
    industryCode: draft.industryCode || undefined,
    scale: draft.scale,
    goal: draft.goal.trim() || undefined,
    initialBudget: Number.isFinite(budget) ? budget : undefined,
    description: draft.description.trim() || undefined,
    timezone: draft.timezone.trim() || undefined,
    logoUrl: draft.logoUrl?.trim() || undefined,
  };
  if (departmentPlacements?.length) {
    const normalized = departmentPlacements
      .map((p) => {
        const head = p.headAgentSlug?.trim();
        const members = (p.memberAgentSlugs ?? []).map((s) => s.trim()).filter(Boolean);
        return {
          name: p.name.trim(),
          headAgentSlug: head && head.length > 0 ? head : null,
          memberAgentSlugs: [...new Set(members)],
        };
      })
      .filter((p) => p.name.length > 0);
    if (normalized.length > 0) {
      payload.departmentPlacements = normalized;
    }
  }
  return payload;
}

function buildCeoPersonalityRecord(draft: NewCompanyDraft): Record<string, unknown> {
  return {
    style: 'balanced',
    tags: draft.ceo.personalityTags,
    decisionStyle: draft.ceo.decisionStyle,
    reportFrequency: draft.ceo.reportFrequency,
  };
}

function isAgentUpdatePending(res: unknown): res is { status: string } {
  return Boolean(res && typeof res === 'object' && 'status' in res && (res as { status: string }).status === 'pending');
}

export function useCompanyCreation() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { refetch: refetchCompanies } = useCompany();

  const createMut = useMutation({
    mutationFn: async (args: { draftId: string; draft: NewCompanyDraft }): Promise<Company> => {
      const departmentPlacements = useNewCompanyStore.getState().wizardDepartmentPlacements;
      const payload = buildCreatePayload(args.draft, departmentPlacements);
      return completeCompanyWizard(args.draftId, payload);
    },
  });

  const runPostCreate = async (draft: NewCompanyDraft, created: Company): Promise<void> => {
    companySession.setCompanyId(created.id);
    await refetchCompanies();
    await queryClient.invalidateQueries({ queryKey: ['companies'] });

    const deadline = Date.now() + 28000;
    let ceoId: string | null = null;
    while (Date.now() < deadline) {
      try {
        const page = await listAgents({ role: 'ceo', page: 1, pageSize: 10 });
        const ceo = page.items.find((a) => String(a.role).toLowerCase() === 'ceo');
        if (ceo?.id) {
          ceoId = ceo.id;
          break;
        }
      } catch {
        /* retry */
      }
      await sleep(700);
    }

    if (!ceoId) {
      message.warning('CEO Agent 尚未就绪，可稍后在「Agent」页补充配置');
      return;
    }

    try {
      // 模型与密钥在创建公司 / 挂载商城 CEO 时已由服务端配置；此处仅写入本公司 CEO 的人格偏好（不含 systemPrompt / llmModel）
      const updated = await updateAgent(ceoId, {
        personality: buildCeoPersonalityRecord(draft),
      });
      if (isAgentUpdatePending(updated)) {
        message.info('CEO 人格偏好已进入审批流，通过后生效；也可稍后在「Agent」页处理');
      }
    } catch (e) {
      message.warning(e instanceof Error ? e.message : 'CEO 人格偏好保存失败，可稍后在 Agent 页修改');
    }
  };

  return { createMut, runPostCreate };
}
