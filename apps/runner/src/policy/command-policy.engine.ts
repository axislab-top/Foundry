import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type PolicyDecisionKind = 'allow' | 'deny' | 'needsApproval';

export interface PolicyEvaluationResult {
  decision: PolicyDecisionKind;
  policyDecisionId: string;
  reason?: string;
}

/**
 * Default-deny: unknown commands are denied.
 * Allowlist: safe build/dev prefixes only.
 * needsApproval: risky but permitted after ApprovalModule + execution token.
 * deny: never run (even with token) — catastrophic patterns.
 */
@Injectable()
export class CommandPolicyEngine {
  private readonly logger = new Logger(CommandPolicyEngine.name);

  /** First token of normalized command must match one of these prefixes (case-insensitive). */
  private readonly allowPrefixes = [
    /^git\s/i,
    /^npm\s/i,
    /^pnpm\s/i,
    /^yarn\s/i,
    /^node\s/i,
    /^npx\s/i,
    /^cargo\s/i,
    /^rustc\s/i,
    /^go\s/i,
    /^python3?\s/i,
    /^make\s/i,
    /^cmake\s/i,
  ];

  /** Never execute, even with approval token. */
  private readonly denyPatterns: RegExp[] = [
    /\bmkfs\.?[a-z0-9]*\b/i,
    /\bdd\s+.*\bof\s*=\s*\/dev\/[a-zA-Z0-9]+/i,
    /(^|[\s;|&])[>]{1,2}\s*\/dev\/[a-zA-Z0-9]+/,
    /\b(insmod|modprobe|rmmod)\b/i,
    /\/dev\/tcp\//i,
    /\bnc\s+[^|&;]*?-[a-zA-Z]*e\s+/i,
  ];

  /** Require ApprovalModule token (action runner.exec) before Job creation. */
  private readonly needsApprovalPatterns: RegExp[] = [
    /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?-r[ef]?/i,
    /\brm\s+.*(-rf|-fr)\b/i,
    /\bsudo\s+.*\b(rm|dd|mkfs|chmod|chown|tee|sh|bash)\b/i,
    /\bdd\s+if=/i,
    /\bchmod\s+[^\n]*\b777\b/,
    /\b(tee|sh)\s+[^\n]*\/etc\/(passwd|shadow)/i,
    /\b(curl|wget)\b[^|\n]*\|\s*(ba)?sh\b/i,
    /\bnc\s+.*\b(e|c)\s+/i,
  ];

  evaluate(commandLine: string): PolicyEvaluationResult {
    const policyDecisionId = randomUUID();
    const line = CommandPolicyEngine.normalize(commandLine);
    if (!line) {
      return {
        decision: 'deny',
        policyDecisionId,
        reason: 'empty_command',
      };
    }

    for (const re of this.denyPatterns) {
      if (re.test(line)) {
        this.logger.warn({ policyDecisionId, bucket: 'deny', re: re.source });
        return {
          decision: 'deny',
          policyDecisionId,
          reason: 'policy_deny_catastrophic',
        };
      }
    }

    if (this.allowPrefixes.some((re) => re.test(line))) {
      for (const re of this.needsApprovalPatterns) {
        if (re.test(line)) {
          return {
            decision: 'needsApproval',
            policyDecisionId,
            reason: 'allowlisted_tool_with_risky_args',
          };
        }
      }
      return { decision: 'allow', policyDecisionId };
    }

    for (const re of this.needsApprovalPatterns) {
      if (re.test(line)) {
        return {
          decision: 'needsApproval',
          policyDecisionId,
          reason: 'risky_command_requires_approval',
        };
      }
    }

    return {
      decision: 'deny',
      policyDecisionId,
      reason: 'not_allowlisted',
    };
  }

  private static normalize(cmd: string): string {
    return cmd.replace(/\s+/g, ' ').trim();
  }
}
