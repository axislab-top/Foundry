import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { TenantContextService } from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { StorageService } from '../../files/storage/storage.service.js';
import { normalizeStorageKey } from '../../files/storage/storage-tenant-path.util.js';
import {
  resolveFileAssetStorageKeyForRead,
  resolveFileAssetStorageKeyForWrite,
} from './file-assets-storage-path.util.js';
import { MemoryService } from '../../memory/services/memory.service.js';
import { Project } from '../../projects/entities/project.entity.js';
import { CreateFileAssetDto } from '../dto/create-file-asset.dto.js';
import { QueryFileAssetsDto } from '../dto/query-file-assets.dto.js';
import { RegisterFileAssetFromContentDto } from '../dto/register-file-asset-from-content.dto.js';
import { RegisterFileAssetDto } from '../dto/register-file-asset.dto.js';
import { UpdateFileAssetDto } from '../dto/update-file-asset.dto.js';
import {
  FileAsset,
  type FileAssetIngestStatus,
} from '../entities/file-asset.entity.js';

export interface FileAssetActor {
  id: string;
  roles?: string[];
  permissions?: string[];
}

@Injectable()
export class FileAssetsService {
  constructor(
    @InjectRepository(FileAsset)
    private readonly fileAssetsRepo: Repository<FileAsset>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    private readonly storageService: StorageService,
    private readonly memoryService: MemoryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private isAdminActor(actor: FileAssetActor): boolean {
    if (actor.roles?.includes('admin')) return true;
    const workerActorId = process.env.WORKER_ACTOR_USER_ID;
    if (workerActorId && actor.id === workerActorId) return true;
    return false;
  }

  private sanitizeFileName(name: string): string {
    const base = name.replace(/[/\\]/g, '_').trim() || 'file';
    return base.slice(0, 200);
  }

  private buildRelativeStoragePath(assetId: string, originalName: string): string {
    return `memory/files/${assetId}/${this.sanitizeFileName(originalName)}`;
  }

  private normalizeStoragePathForCompany(companyId: string, raw: string): string {
    const p = normalizeStorageKey(raw);
    if (p.startsWith(`companies/${companyId}/`)) {
      return p.slice(`companies/${companyId}/`.length);
    }
    if (p.startsWith(`memory/${companyId}/`)) {
      return p;
    }
    return p;
  }

  private async enrichRow(row: FileAsset): Promise<Record<string, unknown>> {
    let sourceAgentName: string | null = null;
    if (row.sourceAgentId) {
      const agent = await this.agentsRepo.findOne({
        where: { id: row.sourceAgentId, companyId: row.companyId },
        select: ['id', 'name'],
      });
      sourceAgentName = agent?.name ?? null;
    }
    let projectName: string | null = null;
    if (row.projectId) {
      const project = await this.projectsRepo.findOne({
        where: { id: row.projectId, companyId: row.companyId },
        select: ['id', 'name'],
      });
      projectName = project?.name ?? null;
    }
    return {
      id: row.id,
      companyId: row.companyId,
      storagePath: row.storagePath,
      name: row.name,
      size: Number(row.size),
      contentType: row.contentType,
      sourceType: row.sourceType,
      sourceAgentId: row.sourceAgentId,
      sourceAgentName,
      sourceTaskId: row.sourceTaskId,
      sourceRunId: row.sourceRunId,
      projectId: row.projectId,
      projectName,
      category: row.category,
      description: row.description,
      ingestStatus: row.ingestStatus,
      ingestCorrelationId: row.ingestCorrelationId,
      ingestChunkCount: row.ingestChunkCount,
      memoryNamespace: row.memoryNamespace,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  async findAll(
    query: QueryFileAssetsDto,
    actor: FileAssetActor,
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const companyId = this.getCompanyIdOrThrow();
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);

    const qb = this.fileAssetsRepo
      .createQueryBuilder('f')
      .where('f.company_id = :companyId', { companyId })
      .andWhere('f.deleted_at IS NULL');

    if (query.q?.trim()) {
      const q = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(f.name) LIKE :q OR LOWER(COALESCE(f.description, \'\')) LIKE :q)',
        { q },
      );
    }

    if (query.sourceType) {
      qb.andWhere('f.source_type = :sourceType', { sourceType: query.sourceType });
    }

    if (query.category) {
      qb.andWhere('f.category = :category', { category: query.category });
    }

    if (query.projectFilter === '__none__') {
      qb.andWhere('f.project_id IS NULL');
    } else if (query.projectId) {
      qb.andWhere('f.project_id = :projectId', { projectId: query.projectId });
    }

    if (query.sourceTaskId) {
      qb.andWhere('f.source_task_id = :sourceTaskId', { sourceTaskId: query.sourceTaskId });
    }

    const sort = query.sort ?? 'time';
    if (sort === 'name') {
      qb.orderBy('f.name', 'ASC');
    } else if (sort === 'size') {
      qb.orderBy('f.size', 'DESC');
    } else {
      qb.orderBy('f.created_at', 'DESC');
    }

    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const items = await Promise.all(rows.map((r) => this.enrichRow(r)));
    return { items, total, page, pageSize };
  }

  async getStats(_actor: FileAssetActor): Promise<{
    totalFiles: number;
    thisMonth: number;
    totalSizeBytes: number;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const base = await this.fileAssetsRepo
      .createQueryBuilder('f')
      .where('f.company_id = :companyId', { companyId })
      .andWhere('f.deleted_at IS NULL');

    const totalFiles = await base.getCount();

    const thisMonth = await base
      .clone()
      .andWhere('f.created_at >= :monthStart', { monthStart })
      .getCount();

    const sizeRow = await base
      .clone()
      .select('COALESCE(SUM(f.size), 0)', 'total')
      .getRawOne<{ total: string }>();

    return {
      totalFiles,
      thisMonth,
      totalSizeBytes: Number(sizeRow?.total ?? 0),
    };
  }

  async findOne(id: string, _actor: FileAssetActor): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'File asset not found',
      });
    }
    return this.enrichRow(row);
  }

  async createFromUpload(
    file: Express.Multer.File,
    dto: CreateFileAssetDto,
    actor: FileAssetActor,
  ): Promise<Record<string, unknown>> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ message: 'No file uploaded' });
    }
    const companyId = this.getCompanyIdOrThrow();
    const assetId = randomUUID();
    const relativePath = this.buildRelativeStoragePath(assetId, file.originalname);

    const row = this.fileAssetsRepo.create({
      id: assetId,
      companyId,
      storagePath: relativePath,
      name: file.originalname,
      size: file.size,
      contentType: file.mimetype || 'application/octet-stream',
      sourceType: 'user',
      projectId: dto.projectId ?? null,
      category: dto.category ?? 'other',
      description: dto.description ?? null,
      ingestStatus: 'none',
      memoryNamespace: dto.memoryNamespace ?? 'company',
      createdByUserId: actor.id,
    });
    await this.fileAssetsRepo.save(row);

    const uploaded = await this.storageService.upload(
      file,
      companyId,
      resolveFileAssetStorageKeyForWrite(companyId, relativePath),
      {
      contentType: file.mimetype,
      metadata: {
        fileAssetId: assetId,
        category: row.category,
        sourceType: 'user',
      },
    });

    row.size = uploaded.size;
    row.contentType = uploaded.contentType;
    await this.fileAssetsRepo.save(row);

    if (dto.ingest) {
      await this.triggerIngest(assetId, dto.memoryNamespace, actor);
      const refreshed = await this.fileAssetsRepo.findOne({ where: { id: assetId } });
      if (refreshed) return this.enrichRow(refreshed);
    }

    return this.enrichRow(row);
  }

  async registerFromAgent(
    dto: RegisterFileAssetDto,
    actor: FileAssetActor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    if (!this.isAdminActor(actor)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Worker or admin required for register',
      });
    }

    const relativePath = this.normalizeStoragePathForCompany(companyId, dto.storagePath);
    const fullKey = relativePath.startsWith('memory/')
      ? relativePath
      : `memory/files/${relativePath.replace(/^memory\/files\//, '')}`;

    const existing = await this.fileAssetsRepo.findOne({
      where: { companyId, storagePath: fullKey, deletedAt: IsNull() },
    });
    if (existing) {
      return this.enrichRow(existing);
    }

    let size = dto.size ?? 0;
    let contentType = dto.contentType ?? 'application/octet-stream';
    let name = dto.name ?? fullKey.split('/').pop() ?? 'file';

    try {
      const info = await this.storageService.getFileInfo(
        companyId,
        resolveFileAssetStorageKeyForRead(companyId, fullKey),
      );
      size = info.size;
      contentType = info.contentType;
      name = info.name || name;
    } catch {
      // allow register with provided metadata when object not yet listed
    }

    const row = this.fileAssetsRepo.create({
      companyId,
      storagePath: fullKey,
      name,
      size,
      contentType,
      sourceType: dto.sourceType ?? 'agent',
      sourceAgentId: dto.sourceAgentId ?? null,
      sourceTaskId: dto.sourceTaskId ?? null,
      sourceRunId: dto.sourceRunId ?? null,
      projectId: dto.projectId ?? null,
      category: dto.category ?? 'report',
      description: dto.description ?? null,
      ingestStatus: 'none',
      memoryNamespace: dto.memoryNamespace ?? (dto.sourceAgentId ? `agent:${dto.sourceAgentId}` : 'company'),
    });
    await this.fileAssetsRepo.save(row);

    if (dto.ingest) {
      await this.triggerIngest(row.id, dto.memoryNamespace, actor);
      const refreshed = await this.fileAssetsRepo.findOne({ where: { id: row.id } });
      if (refreshed) return this.enrichRow(refreshed);
    }

    return this.enrichRow(row);
  }

  /** Worker：将 Skill 文本产出写入对象存储并登记 file_asset（可下载）。 */
  async registerFromAgentContent(
    dto: RegisterFileAssetFromContentDto,
    actor: FileAssetActor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    if (!this.isAdminActor(actor)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Worker or admin required for registerFromContent',
      });
    }

    const content = String(dto.content ?? '').trim();
    if (!content) {
      throw new BadRequestException({ message: 'content is required' });
    }

    const assetId = randomUUID();
    const fileName = this.sanitizeFileName(dto.name || 'deliverable.md');
    const relativePath = this.buildRelativeStoragePath(assetId, fileName);
    const buffer = Buffer.from(content, 'utf8');
    const contentType = dto.contentType?.trim() || (fileName.endsWith('.md') ? 'text/markdown' : 'text/plain');

    const uploadFile = {
      buffer,
      size: buffer.length,
      originalname: fileName,
      mimetype: contentType,
    } as Express.Multer.File;

    // 写入必须使用 companies/{companyId}/... 前缀（memory/ 根路径在 write 模式会被拒绝）
    const uploadPath = resolveFileAssetStorageKeyForWrite(companyId, relativePath);
    await this.storageService.upload(uploadFile, companyId, uploadPath, {
      contentType,
      metadata: {
        fileAssetId: assetId,
        category: dto.category ?? 'report',
        sourceType: dto.sourceType ?? 'agent',
      },
    });

    const fullKey = relativePath.startsWith('memory/')
      ? relativePath
      : `memory/files/${relativePath.replace(/^memory\/files\//, '')}`;

    const row = this.fileAssetsRepo.create({
      id: assetId,
      companyId,
      storagePath: fullKey,
      name: fileName,
      size: buffer.length,
      contentType,
      sourceType: dto.sourceType ?? 'agent',
      sourceAgentId: dto.sourceAgentId ?? null,
      sourceTaskId: dto.sourceTaskId ?? null,
      sourceRunId: dto.sourceRunId ?? null,
      projectId: dto.projectId ?? null,
      category: dto.category ?? 'report',
      description: dto.description ?? null,
      ingestStatus: 'none',
      memoryNamespace: dto.memoryNamespace ?? (dto.sourceAgentId ? `agent:${dto.sourceAgentId}` : 'company'),
    });
    await this.fileAssetsRepo.save(row);

    if (dto.ingest) {
      await this.triggerIngest(row.id, dto.memoryNamespace, actor);
      const refreshed = await this.fileAssetsRepo.findOne({ where: { id: row.id } });
      if (refreshed) return this.enrichRow(refreshed);
    }

    return this.enrichRow(row);
  }

  async update(
    id: string,
    dto: UpdateFileAssetDto,
    _actor: FileAssetActor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }
    if (dto.projectId !== undefined) row.projectId = dto.projectId;
    if (dto.category !== undefined) row.category = dto.category;
    if (dto.description !== undefined) row.description = dto.description;
    await this.fileAssetsRepo.save(row);
    return this.enrichRow(row);
  }

  async softDelete(id: string, _actor: FileAssetActor): Promise<{ success: boolean }> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }
    try {
      await this.storageService.delete(
        companyId,
        resolveFileAssetStorageKeyForRead(companyId, row.storagePath),
      );
    } catch {
      // continue soft-delete even if blob missing
    }
    row.deletedAt = new Date();
    await this.fileAssetsRepo.save(row);
    return { success: true };
  }

  /** 经 API 直接读取对象存储内容（避免预签名 URL 在 MinIO 不可达时长时间挂起）。 */
  async downloadBinary(
    id: string,
    _actor: FileAssetActor,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }
    const buffer = await this.storageService.download(
      companyId,
      resolveFileAssetStorageKeyForRead(companyId, row.storagePath),
    );
    return {
      buffer,
      contentType: row.contentType || 'application/octet-stream',
      fileName: row.name || 'download',
    };
  }

  /** Worker 合并交付文档时读取文本类 file_asset 全文。 */
  async readTextContent(
    id: string,
    _actor: FileAssetActor,
    maxBytes = 512_000,
  ): Promise<{ text: string; fileName: string; contentType: string }> {
    const { buffer, contentType, fileName } = await this.downloadBinary(id, _actor);
    const ct = String(contentType ?? '').toLowerCase();
    const lowerName = String(fileName ?? '').toLowerCase();
    const isText =
      ct.startsWith('text/') ||
      ct.includes('markdown') ||
      ct.includes('json') ||
      /\.(md|txt|csv|json|yaml|yml)$/i.test(lowerName);
    if (!isText) {
      throw new BadRequestException({ message: 'File asset is not readable as text' });
    }
    const cap = Math.max(1024, Math.min(2_000_000, maxBytes));
    const text = buffer.slice(0, cap).toString('utf8');
    return { text, fileName, contentType };
  }

  async getDownloadUrl(
    id: string,
    expiresIn = 3600,
    _actor: FileAssetActor,
  ): Promise<{ url: string; expiresIn: number }> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }
    const url = await this.storageService.getUrl(
      companyId,
      resolveFileAssetStorageKeyForRead(companyId, row.storagePath),
      expiresIn,
      row.name,
    );
    return { url, expiresIn };
  }

  async triggerIngest(
    id: string,
    namespaceOverride?: string,
    _actor?: FileAssetActor,
  ): Promise<Record<string, unknown>> {
    const companyId = this.getCompanyIdOrThrow();
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }

    const namespace = namespaceOverride?.trim() || row.memoryNamespace || 'company';
    const fullStoragePath = resolveFileAssetStorageKeyForRead(companyId, row.storagePath);

    const { correlationId } = await this.memoryService.publishDocumentIngestAsync({
      companyId,
      storagePath: fullStoragePath,
      namespace,
      collectionLabel: `File: ${row.name}`,
      fileAssetId: row.id,
    });

    row.ingestStatus = 'pending';
    row.ingestCorrelationId = correlationId;
    row.memoryNamespace = namespace;
    await this.fileAssetsRepo.save(row);
    return this.enrichRow(row);
  }

  async markIngestStatus(
    id: string,
    status: FileAssetIngestStatus,
    opts?: { correlationId?: string; chunkCount?: number },
    actor?: FileAssetActor,
  ): Promise<{ success: boolean }> {
    if (actor && !this.isAdminActor(actor)) {
      throw new ForbiddenException({ message: 'Internal only' });
    }
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({ message: 'Company ID is required' });
    }
    const row = await this.fileAssetsRepo.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException({ message: 'File asset not found' });
    }
    if (
      opts?.correlationId &&
      row.ingestCorrelationId &&
      row.ingestCorrelationId !== opts.correlationId
    ) {
      return { success: false };
    }
    row.ingestStatus = status;
    if (opts?.chunkCount != null) row.ingestChunkCount = opts.chunkCount;
    await this.fileAssetsRepo.save(row);
    return { success: true };
  }
}
