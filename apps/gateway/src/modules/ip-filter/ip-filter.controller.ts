import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IpFilterService } from './services/ip-filter.service.js';
import { AddIpDto } from './dto/add-ip.dto.js';
import { QueryIpFilterDto, IpFilterType } from './dto/query-ip-filter.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';

/**
 * IP过滤控制器
 * 提供IP黑白名单管理API
 */
@Controller('admin/ip-filter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin') // 仅管理员可以管理IP过滤规则
export class IpFilterController {
  constructor(private readonly ipFilterService: IpFilterService) {}

  /**
   * 添加IP到白名单
   * POST /api/admin/ip-filter/whitelist
   */
  @Post('whitelist')
  @HttpCode(HttpStatus.CREATED)
  async addToWhitelist(@Body() addIpDto: AddIpDto) {
    try {
      await this.ipFilterService.addToWhitelist(
        addIpDto.ip,
        addIpDto.route,
        addIpDto.description,
      );
      return {
        success: true,
        message: 'IP added to whitelist successfully',
        data: {
          ip: addIpDto.ip,
          route: addIpDto.route,
        },
      };
    } catch (error) {
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to add IP to whitelist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 添加IP到黑名单
   * POST /api/admin/ip-filter/blacklist
   */
  @Post('blacklist')
  @HttpCode(HttpStatus.CREATED)
  async addToBlacklist(@Body() addIpDto: AddIpDto) {
    try {
      await this.ipFilterService.addToBlacklist(
        addIpDto.ip,
        addIpDto.route,
        addIpDto.description,
      );
      return {
        success: true,
        message: 'IP added to blacklist successfully',
        data: {
          ip: addIpDto.ip,
          route: addIpDto.route,
        },
      };
    } catch (error) {
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to add IP to blacklist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 从白名单删除IP
   * DELETE /api/admin/ip-filter/whitelist/:ip
   */
  @Delete('whitelist/:ip')
  @HttpCode(HttpStatus.OK)
  async removeFromWhitelist(
    @Param('ip') ip: string,
    @Query('route') route?: string,
  ) {
    try {
      // URL解码IP地址
      const decodedIp = decodeURIComponent(ip);
      const removed = await this.ipFilterService.removeFromWhitelist(decodedIp, route);
      
      if (!removed) {
        throw new GatewayException(
          ErrorCode.NOT_FOUND,
          `IP ${decodedIp} not found in whitelist`,
          404,
        );
      }

      return {
        success: true,
        message: 'IP removed from whitelist successfully',
        data: {
          ip: decodedIp,
          route,
        },
      };
    } catch (error) {
      if (error instanceof GatewayException) {
        throw error;
      }
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to remove IP from whitelist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 从黑名单删除IP
   * DELETE /api/admin/ip-filter/blacklist/:ip
   */
  @Delete('blacklist/:ip')
  @HttpCode(HttpStatus.OK)
  async removeFromBlacklist(
    @Param('ip') ip: string,
    @Query('route') route?: string,
  ) {
    try {
      // URL解码IP地址
      const decodedIp = decodeURIComponent(ip);
      const removed = await this.ipFilterService.removeFromBlacklist(decodedIp, route);
      
      if (!removed) {
        throw new GatewayException(
          ErrorCode.NOT_FOUND,
          `IP ${decodedIp} not found in blacklist`,
          404,
        );
      }

      return {
        success: true,
        message: 'IP removed from blacklist successfully',
        data: {
          ip: decodedIp,
          route,
        },
      };
    } catch (error) {
      if (error instanceof GatewayException) {
        throw error;
      }
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to remove IP from blacklist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 查询白名单
   * GET /api/admin/ip-filter/whitelist
   */
  @Get('whitelist')
  async getWhitelist(@Query() queryDto: QueryIpFilterDto) {
    try {
      const rules = await this.ipFilterService.getWhitelist(queryDto.route);
      return {
        success: true,
        data: {
          type: IpFilterType.WHITELIST,
          route: queryDto.route,
          count: rules.length,
          rules,
        },
      };
    } catch (error) {
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to get whitelist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 查询黑名单
   * GET /api/admin/ip-filter/blacklist
   */
  @Get('blacklist')
  async getBlacklist(@Query() queryDto: QueryIpFilterDto) {
    try {
      const rules = await this.ipFilterService.getBlacklist(queryDto.route);
      return {
        success: true,
        data: {
          type: IpFilterType.BLACKLIST,
          route: queryDto.route,
          count: rules.length,
          rules,
        },
      };
    } catch (error) {
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to get blacklist: ${error.message}`,
        500,
      );
    }
  }

  /**
   * 查询所有规则
   * GET /api/admin/ip-filter
   */
  @Get()
  async getAllRules(@Query() queryDto: QueryIpFilterDto) {
    try {
      const [whitelist, blacklist] = await Promise.all([
        this.ipFilterService.getWhitelist(queryDto.route),
        this.ipFilterService.getBlacklist(queryDto.route),
      ]);

      return {
        success: true,
        data: {
          route: queryDto.route,
          whitelist: {
            count: whitelist.length,
            rules: whitelist,
          },
          blacklist: {
            count: blacklist.length,
            rules: blacklist,
          },
        },
      };
    } catch (error) {
      throw new GatewayException(
        ErrorCode.INTERNAL_ERROR,
        `Failed to get IP filter rules: ${error.message}`,
        500,
      );
    }
  }
}

