import { BadRequestException, Injectable } from '@nestjs/common';
import {
  parseSkillMd,
  parseSkillMdToDbPayload,
  skillRowToSkillMd,
  validateSkillMdFrontmatter,
  type SkillMdDbPayload,
  type SkillMdValidationIssue,
} from '@foundry/skill-md';
import type { Skill } from '../entities/skill.entity.js';

@Injectable()
export class SkillMdBridgeService {
  parse(raw: string): { issues: SkillMdValidationIssue[]; payload?: SkillMdDbPayload } {
    try {
      const parsed = parseSkillMd(raw);
      const issues = validateSkillMdFrontmatter(parsed.frontmatter);
      if (issues.length) return { issues };
      if (!parsed.body.trim() && !parsed.frontmatter.promptTemplate?.trim()) {
        return { issues: [{ field: 'body', message: 'SKILL.md body (instructions) is required' }] };
      }
      const { payload } = parseSkillMdToDbPayload(raw);
      return { issues: [], payload };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Invalid SKILL.md: ${msg}`);
    }
  }

  toSkillMd(skill: Skill): string {
    return skillRowToSkillMd({
      name: skill.name,
      displayName: skill.displayName,
      description: skill.description,
      promptTemplate: skill.promptTemplate,
      implementationType: skill.implementationType,
      toolSchema: skill.toolSchema,
      inputSchema: skill.inputSchema,
      category: skill.category,
      icon: skill.icon,
      metadata: skill.metadata,
    });
  }

  applyPayloadToSkillRow(skill: Skill, payload: SkillMdDbPayload): void {
    skill.name = payload.name;
    skill.displayName = payload.displayName;
    skill.description = payload.description;
    skill.promptTemplate = payload.promptTemplate;
    skill.implementationType = payload.implementationType;
    skill.toolSchema = payload.toolSchema;
    skill.inputSchema = payload.inputSchema;
    skill.category = payload.category;
    skill.icon = payload.icon;
    skill.metadata = {
      ...(skill.metadata && typeof skill.metadata === 'object' ? skill.metadata : {}),
      ...payload.metadata,
    };
  }
}
