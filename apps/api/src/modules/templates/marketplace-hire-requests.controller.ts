import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TenantContextService } from '@service/tenant';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserInfo } from '../../common/types/user.types.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { CreateMarketplaceHireRequestDto } from './dto/create-marketplace-hire-request.dto.js';
import { QueryMarketplaceHireRequestsDto } from './dto/query-marketplace-hire-requests.dto.js';
import { RejectMarketplaceHireRequestDto } from './dto/reject-marketplace-hire-request.dto.js';
import { MarketplaceHireRequestsService } from './services/marketplace-hire-requests.service.js';

@ApiTags('marketplace-hire-requests')
@ApiBearerAuth('JWT-auth')
@Controller('companies/:companyId/marketplace/hire-requests')
export class MarketplaceHireRequestsController {
  constructor(
    private readonly hireRequestsService: MarketplaceHireRequestsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private resolveCompanyId(paramCompanyId: string): string {
    const tenantCompanyId = this.tenantContext.getCompanyId();
    if (!tenantCompanyId || tenantCompanyId !== paramCompanyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '公司上下文与路径不一致',
      });
    }
    return paramCompanyId;
  }

  private actor(user: UserInfo) {
    return { id: user.id, roles: user.roles };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '发起商城 Agent 招聘申请' })
  @ApiParam({ name: 'companyId', description: '公司 ID' })
  async create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateMarketplaceHireRequestDto,
    @CurrentUser() user: UserInfo,
  ) {
    const cid = this.resolveCompanyId(companyId);
    return this.hireRequestsService.create(cid, dto, this.actor(user));
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '招聘申请列表' })
  async list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: QueryMarketplaceHireRequestsDto,
    @CurrentUser() user: UserInfo,
  ) {
    const cid = this.resolveCompanyId(companyId);
    return this.hireRequestsService.list(cid, query, this.actor(user));
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '招聘申请详情' })
  async findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserInfo,
  ) {
    const cid = this.resolveCompanyId(companyId);
    return this.hireRequestsService.findOne(cid, id, this.actor(user));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审批通过并安装商城 Agent' })
  async approve(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserInfo,
  ) {
    const cid = this.resolveCompanyId(companyId);
    return this.hireRequestsService.approve(cid, id, this.actor(user));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '驳回待审批申请，或取消「处理中」且尚未记录购买事件的安装',
  })
  async reject(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectMarketplaceHireRequestDto,
    @CurrentUser() user: UserInfo,
  ) {
    const cid = this.resolveCompanyId(companyId);
    return this.hireRequestsService.reject(cid, id, this.actor(user), body.rejectReason);
  }
}
