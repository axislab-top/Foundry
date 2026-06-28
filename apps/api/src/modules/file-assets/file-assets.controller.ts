import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { TenantContextService } from '@service/tenant';
import { CreateFileAssetDto } from './dto/create-file-asset.dto.js';
import { FileAssetsService } from './services/file-assets.service.js';

type RequestWithCompany = Request & {
  companyId?: string;
  user?: { id?: string; roles?: string[]; permissions?: string[] };
};

@ApiTags('file-assets')
@ApiBearerAuth('JWT-auth')
@Controller('file-assets')
export class FileAssetsController {
  constructor(
    private readonly fileAssetsService: FileAssetsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private requireCompanyId(req: RequestWithCompany): string {
    const c = req.companyId?.trim();
    if (!c) {
      throw new BadRequestException(
        'companyId is required (x-company-id header or user context)',
      );
    }
    return c;
  }

  private actorFromReq(req: RequestWithCompany) {
    return {
      id: String(req.user?.id ?? ''),
      roles: req.user?.roles,
      permissions: req.user?.permissions,
    };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件并创建资产记录' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        projectId: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
        ingest: { type: 'string' },
        memoryNamespace: { type: 'string' },
      },
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: CreateFileAssetDto & { ingest?: string },
    @Req() req: RequestWithCompany,
  ) {
    this.requireCompanyId(req);
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const dto: CreateFileAssetDto = {
      projectId: query.projectId,
      category: query.category,
      description: query.description,
      memoryNamespace: query.memoryNamespace,
      ingest: query.ingest === 'true' || query.ingest === true,
    };
    const companyId = this.requireCompanyId(req);
    const data = await this.tenantContext.runWithCompanyId(companyId, () =>
      this.fileAssetsService.createFromUpload(file, dto, this.actorFromReq(req)),
    );
    return { success: true, data };
  }

  @Get(':id/download')
  @ApiOperation({ summary: '下载文件资产（attachment）' })
  async download(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: RequestWithCompany,
  ) {
    const companyId = this.requireCompanyId(req);
    const { buffer, contentType, fileName } = await this.tenantContext.runWithCompanyId(
      companyId,
      () => this.fileAssetsService.downloadBinary(id, this.actorFromReq(req)),
    );
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'download';
    const encodedName = encodeURIComponent(fileName);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.send(buffer);
  }
}
