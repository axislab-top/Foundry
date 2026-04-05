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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StorageService } from './storage/storage.service.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { ListFilesDto } from './dto/list-files.dto.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { FILES_PERMISSIONS } from './constants/permissions.constants.js';

/**
 * 文件管理控制器
 */
@ApiTags('files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
export class FilesController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * 上传文件
   * POST /api/files
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @Permissions(FILES_PERMISSIONS.CREATE, FILES_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '上传文件', description: '上传文件到对象存储' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '要上传的文件',
        },
        path: {
          type: 'string',
          description: '存储路径（可选）',
        },
        contentType: {
          type: 'string',
          description: '内容类型（可选）',
        },
        public: {
          type: 'string',
          description: '是否公开访问（true/false）',
        },
        metadata: {
          type: 'string',
          description: '元数据（JSON 字符串，可选）',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '文件上传成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadFileDto,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    const fileInfo = await this.storageService.upload(file, query.path, {
      contentType: query.contentType,
      public: query.public === 'true',
      metadata: query.metadata ? JSON.parse(query.metadata) : undefined,
    });

    return {
      success: true,
      data: fileInfo,
    };
  }

  /**
   * 列出文件
   * GET /api/files
   */
  @Get()
  @Permissions(FILES_PERMISSIONS.READ)
  async list(@Query() query: ListFilesDto) {
    const files = await this.storageService.list(query.prefix, {
      maxKeys: query.maxKeys,
      marker: query.marker,
      recursive: query.recursive === 'true',
    });

    return {
      success: true,
      data: files,
      count: files.length,
    };
  }

  /**
   * 获取文件 URL
   * GET /api/files/:path/url
   */
  @Get(':path(*)/url')
  @Permissions(FILES_PERMISSIONS.URL, FILES_PERMISSIONS.READ)
  async getUrl(
    @Param('path') path: string,
    @Query('expiresIn', new DefaultValuePipe(3600), ParseIntPipe)
    expiresIn: number,
  ) {
    const url = await this.storageService.getUrl(path, expiresIn);

    return {
      success: true,
      data: {
        url,
        expiresIn,
      },
    };
  }

  /**
   * 获取文件信息
   * GET /api/files/:path/info
   */
  @Get(':path(*)/info')
  @Permissions(FILES_PERMISSIONS.READ)
  async getFileInfo(@Param('path') path: string) {
    const fileInfo = await this.storageService.getFileInfo(path);

    return {
      success: true,
      data: fileInfo,
    };
  }

  /**
   * 下载文件
   * GET /api/files/:path
   */
  @Get(':path(*)')
  @Permissions(FILES_PERMISSIONS.READ)
  async download(@Param('path') path: string, @Res() res: Response) {
    const buffer = await this.storageService.download(path);
    const fileInfo = await this.storageService.getFileInfo(path);

    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
    res.send(buffer);
  }

  /**
   * 删除文件
   * DELETE /api/files/:path
   */
  @Delete(':path(*)')
  @Permissions(FILES_PERMISSIONS.DELETE, FILES_PERMISSIONS.WRITE)
  async delete(@Param('path') path: string) {
    const deleted = await this.storageService.delete(path);

    return {
      success: deleted,
      message: deleted ? 'File deleted successfully' : 'File not found',
    };
  }
}

