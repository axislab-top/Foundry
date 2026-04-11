import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import { StorageService } from './storage/storage.service.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { ListFilesDto } from './dto/list-files.dto.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { FILES_PERMISSIONS } from './constants/permissions.constants.js';

type RequestWithCompany = Request & { companyId?: string };

@ApiTags('files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
export class FilesController {
  constructor(private readonly storageService: StorageService) {}

  private requireCompanyId(req: RequestWithCompany): string {
    const c = req.companyId?.trim();
    if (!c) {
      throw new BadRequestException(
        'companyId is required (x-company-id header or user context)',
      );
    }
    return c;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @Permissions(FILES_PERMISSIONS.CREATE, FILES_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '上传文件', description: '上传文件到对象存储' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '要上传的文件' },
        path: { type: 'string', description: '存储路径（可选，相对 companies/{companyId}/）' },
        contentType: { type: 'string' },
        public: { type: 'string' },
        metadata: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '文件上传成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadFileDto,
    @Req() req: RequestWithCompany,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    const companyId = this.requireCompanyId(req);
    const fileInfo = await this.storageService.upload(file, companyId, query.path, {
      contentType: query.contentType,
      public: query.public === 'true',
      metadata: query.metadata ? JSON.parse(query.metadata) : undefined,
    });
    return { success: true, data: fileInfo };
  }

  @Get()
  @Permissions(FILES_PERMISSIONS.READ)
  async list(@Query() query: ListFilesDto, @Req() req: RequestWithCompany) {
    const companyId = this.requireCompanyId(req);
    const files = await this.storageService.list(companyId, query.prefix, {
      maxKeys: query.maxKeys,
      marker: query.marker,
      recursive: query.recursive === 'true',
    });
    return { success: true, data: files, count: files.length };
  }

  @Get(':path(*)/url')
  @Permissions(FILES_PERMISSIONS.URL, FILES_PERMISSIONS.READ)
  async getUrl(
    @Param('path') path: string,
    @Query('expiresIn', new DefaultValuePipe(3600), ParseIntPipe) expiresIn: number,
    @Req() req: RequestWithCompany,
  ) {
    const companyId = this.requireCompanyId(req);
    const url = await this.storageService.getUrl(companyId, path, expiresIn);
    return { success: true, data: { url, expiresIn } };
  }

  @Get(':path(*)/info')
  @Permissions(FILES_PERMISSIONS.READ)
  async getFileInfo(@Param('path') path: string, @Req() req: RequestWithCompany) {
    const companyId = this.requireCompanyId(req);
    const fileInfo = await this.storageService.getFileInfo(companyId, path);
    return { success: true, data: fileInfo };
  }

  @Get(':path(*)')
  @Permissions(FILES_PERMISSIONS.READ)
  async download(
    @Param('path') path: string,
    @Res() res: Response,
    @Req() req: RequestWithCompany,
  ) {
    const companyId = this.requireCompanyId(req);
    const buffer = await this.storageService.download(companyId, path);
    const fileInfo = await this.storageService.getFileInfo(companyId, path);
    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
    res.send(buffer);
  }

  @Delete(':path(*)')
  @Permissions(FILES_PERMISSIONS.DELETE, FILES_PERMISSIONS.WRITE)
  async delete(@Param('path') path: string, @Req() req: RequestWithCompany) {
    const companyId = this.requireCompanyId(req);
    const deleted = await this.storageService.delete(companyId, path);
    return {
      success: deleted,
      message: deleted ? 'File deleted successfully' : 'File not found',
    };
  }
}
