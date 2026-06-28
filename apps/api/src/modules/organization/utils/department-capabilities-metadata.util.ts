import {
  classifyPhaseTaskTypes,
  validateResponsibilitySummary,
  type DepartmentCapabilitiesSource,
} from '@foundry/contracts/types/department-assignment';
import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

export interface DepartmentCapabilitiesInput {
  responsibilitySummary?: string | null;
  description?: string | null;
  taskTypeTags?: string[] | null;
  excludesTaskTypeTags?: string[] | null;
}

export interface PlatformCapabilitiesRow {
  slug: string;
  responsibilitySummary?: string | null;
  taskTypeTags?: string[] | null;
  excludesTaskTypeTags?: string[] | null;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => String(t ?? '').trim()).filter(Boolean))];
}

export function resolveResponsibilitySummaryText(input: DepartmentCapabilitiesInput): string {
  const explicit = String(input.responsibilitySummary ?? '').trim();
  if (explicit) return explicit;
  return String(input.description ?? '').trim();
}

export function assertResponsibilitySummaryPresent(input: DepartmentCapabilitiesInput): string {
  const summary = resolveResponsibilitySummaryText(input);
  const v = validateResponsibilitySummary(summary);
    if (v.ok === false) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: v.message,
      });
    }
  return summary;
}

export function buildDepartmentNodeCapabilityMetadata(params: {
  input: DepartmentCapabilitiesInput;
  platformRow?: PlatformCapabilitiesRow | null;
  capabilitiesSource: DepartmentCapabilitiesSource;
  platformDepartmentSlug?: string | null;
}): Record<string, unknown> {
  const summary =
    resolveResponsibilitySummaryText(params.input) ||
    String(params.platformRow?.responsibilitySummary ?? '').trim();
  const validated = assertResponsibilitySummaryPresent({
    responsibilitySummary: summary,
    description: summary,
  });

  let tags = normalizeTags(params.input.taskTypeTags);
  let excludes = normalizeTags(params.input.excludesTaskTypeTags);
  if (!tags.length && params.platformRow) {
    tags = normalizeTags(params.platformRow.taskTypeTags);
    excludes = normalizeTags(params.platformRow.excludesTaskTypeTags);
  }
  if (!tags.length) {
    tags = classifyPhaseTaskTypes('', '', validated);
  }

  const meta: Record<string, unknown> = {
    responsibilitySummary: validated,
    taskTypeTags: tags,
    capabilitiesSource: params.capabilitiesSource,
  };
  if (excludes.length) meta.excludesTaskTypeTags = excludes;
  if (params.platformDepartmentSlug) {
    meta.platformDepartmentSlug = params.platformDepartmentSlug;
  }
  return meta;
}

export function suggestCapabilitiesFromText(name: string, summaryDraft: string): {
  suggestedTaskTypeTags: string[];
  suggestedResponsibilitySummary: string;
} {
  const summary = String(summaryDraft ?? '').trim();
  const tags = classifyPhaseTaskTypes(String(name ?? '').trim(), '', summary);
  return {
    suggestedTaskTypeTags: tags,
    suggestedResponsibilitySummary: summary,
  };
}

export function mergeDepartmentMetadataPatch(
  existing: Record<string, unknown> | null | undefined,
  patch: DepartmentCapabilitiesInput,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  const summary = resolveResponsibilitySummaryText(patch);
  if (summary) {
    const v = validateResponsibilitySummary(summary);
    if (v.ok === false) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: v.message });
    }
    base.responsibilitySummary = summary;
  }
  if (patch.taskTypeTags !== undefined && patch.taskTypeTags !== null) {
    base.taskTypeTags = normalizeTags(patch.taskTypeTags);
  }
  if (patch.excludesTaskTypeTags !== undefined && patch.excludesTaskTypeTags !== null) {
    base.excludesTaskTypeTags = normalizeTags(patch.excludesTaskTypeTags);
  }
  return base;
}
