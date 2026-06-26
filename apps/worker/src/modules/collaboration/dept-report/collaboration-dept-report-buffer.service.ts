import { Injectable, Logger } from '@nestjs/common';
import type { DirectorDeptReportPayload, EmployeeDeptReportPayload } from '@contracts/types';
import { CollabRedisCacheService } from '../../../common/cache/collab-redis-cache.service.js';
import { ConfigService } from '../../../common/config/config.service.js';

const TTL_MS = 7 * 24 * 3600 * 1000;

function employeeKey(prefix: string, distributionId: string, department: string, taskId: string): string {
  return `${prefix}:dept_report:emp:${distributionId}:${department}:${taskId}`;
}

function directorKey(prefix: string, distributionId: string, department: string): string {
  return `${prefix}:dept_report:dir:${distributionId}:${department}`;
}

function employeeIndexKey(prefix: string, distributionId: string, department: string): string {
  return `${prefix}:dept_report:emp_idx:${distributionId}:${department}`;
}

function directorIndexKey(prefix: string, distributionId: string): string {
  return `${prefix}:dept_report:dir_idx:${distributionId}`;
}

function expectedDelegationsKey(prefix: string, distributionId: string, department: string): string {
  return `${prefix}:dept_report:expected:${distributionId}:${department}`;
}

function qcReworkCountKey(prefix: string, distributionId: string, department: string): string {
  return `${prefix}:dept_report:qc_rework:${distributionId}:${department}`;
}

/**
 * Redis 缓冲：员工汇报 → 主管聚合 → Supervision 读取。
 */
@Injectable()
export class CollaborationDeptReportBufferService {
  private readonly logger = new Logger(CollaborationDeptReportBufferService.name);

  constructor(
    private readonly collabRedis: CollabRedisCacheService,
    private readonly config: ConfigService,
  ) {}

  private prefix(): string {
    return this.config.getRedisKeyPrefix();
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.collabRedis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    await this.collabRedis.setPx(key, JSON.stringify(value), TTL_MS);
  }

  async storeEmployeeReport(report: EmployeeDeptReportPayload): Promise<void> {
    const distId = String(report.distributionId ?? report.traceId).trim();
    if (!distId) return;
    const key = employeeKey(this.prefix(), distId, report.department, report.taskId);
    const idxKey = employeeIndexKey(this.prefix(), distId, report.department);
    await this.writeJson(key, report);
    // 使用 Redis SET 原子 SADD 替代 JSON 数组 read-modify-write，避免并发覆盖
    await this.collabRedis.sadd(idxKey, report.taskId, TTL_MS);
    this.logger.debug('dept_report.employee_stored', {
      companyId: report.companyId,
      distributionId: distId,
      department: report.department,
      taskId: report.taskId,
    });
  }

  async listEmployeeReports(
    distributionId: string,
    department: string,
  ): Promise<EmployeeDeptReportPayload[]> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept) return [];
    const idxKey = employeeIndexKey(this.prefix(), distId, dept);
    // 使用 Redis SET SMEMBERS 替代 JSON 数组读取
    const idx = await this.collabRedis.smembers(idxKey);
    const out: EmployeeDeptReportPayload[] = [];
    for (const taskId of idx) {
      const key = employeeKey(this.prefix(), distId, dept, taskId);
      const row = await this.readJson<EmployeeDeptReportPayload>(key);
      if (row) out.push(row);
    }
    return out;
  }

  async storeDirectorReport(report: DirectorDeptReportPayload): Promise<void> {
    const distId = String(report.distributionId).trim();
    if (!distId) return;
    const key = directorKey(this.prefix(), distId, report.department);
    const idxKey = directorIndexKey(this.prefix(), distId);
    await this.writeJson(key, report);
    // 使用 Redis SET 原子 SADD 替代 JSON 数组 read-modify-write
    await this.collabRedis.sadd(idxKey, report.department, TTL_MS);
    this.logger.log('dept_report.director_stored', {
      companyId: report.companyId,
      distributionId: distId,
      department: report.department,
      readyForSupervision: report.readyForSupervision,
    });
  }

  async getDirectorReport(
    distributionId: string,
    department: string,
  ): Promise<DirectorDeptReportPayload | null> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept) return null;
    return this.readJson<DirectorDeptReportPayload>(directorKey(this.prefix(), distId, dept));
  }

  async listDirectorReports(distributionId: string): Promise<DirectorDeptReportPayload[]> {
    const distId = distributionId.trim();
    if (!distId) return [];
    const idxKey = directorIndexKey(this.prefix(), distId);
    // 使用 Redis SET SMEMBERS 替代 JSON 数组读取
    const idx = await this.collabRedis.smembers(idxKey);
    const out: DirectorDeptReportPayload[] = [];
    for (const dept of idx) {
      const row = await this.readJson<DirectorDeptReportPayload>(directorKey(this.prefix(), distId, dept));
      if (row) out.push(row);
    }
    return out;
  }

  async hasDirectorReportReady(distributionId: string, department: string): Promise<boolean> {
    const r = await this.getDirectorReport(distributionId, department);
    return Boolean(r?.readyForSupervision);
  }

  /**
   * L2 派发时记录本部门本轮应完成的员工任务数（barrier 用）。
   * 按 distributionId + department 维度；与员工汇报索引一致。
   */
  async setExpectedDelegations(
    distributionId: string,
    department: string,
    count: number,
  ): Promise<void> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept || count <= 0) return;
    const key = expectedDelegationsKey(this.prefix(), distId, dept);
    await this.writeJson(key, { count, updatedAt: new Date().toISOString() });
    this.logger.debug('dept_report.expected_delegations_set', {
      distributionId: distId,
      department: dept,
      count,
    });
  }

  async getExpectedDelegations(distributionId: string, department: string): Promise<number | null> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept) return null;
    const key = expectedDelegationsKey(this.prefix(), distId, dept);
    const row = await this.readJson<{ count?: number }>(key);
    const count = Number(row?.count ?? 0);
    return count > 0 ? count : null;
  }

  async getQcReworkCount(distributionId: string, department: string): Promise<number> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept) return 0;
    const row = await this.readJson<{ count?: number }>(qcReworkCountKey(this.prefix(), distId, dept));
    const n = Number(row?.count ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  async incrementQcReworkCount(distributionId: string, department: string): Promise<number> {
    const distId = distributionId.trim();
    const dept = department.trim();
    if (!distId || !dept) return 0;
    const key = qcReworkCountKey(this.prefix(), distId, dept);
    const prev = await this.getQcReworkCount(distId, dept);
    const next = prev + 1;
    await this.writeJson(key, { count: next, updatedAt: new Date().toISOString() });
    return next;
  }
}
