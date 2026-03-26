import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { USERS_PERMISSIONS } from './constants/permissions.constants.js';

/**
 * 用户控制器
 * 处理用户相关的 HTTP 请求
 * 
 * 注意：所有端点默认需要认证（通过全局守卫），除非使用 @Public() 装饰器
 */
@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * 用户注册
   * 公开接口，不需要认证
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: '用户注册', description: '用户自主注册，注册成功后返回用户信息' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: '注册成功，返回用户信息' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '邮箱或用户名已存在' })
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.usersService.register(registerDto);
    // 不返回密码哈希
    const { passwordHash, ...result } = user;
    return result;
  }

  /**
   * 创建用户
   * 需要管理员权限
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  @Permissions(USERS_PERMISSIONS.CREATE, USERS_PERMISSIONS.WRITE)
  @ApiOperation({ summary: '创建用户', description: '创建新用户，需要管理员权限' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: '用户创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  @ApiResponse({ status: 403, description: '权限不足' })
  async create(@Body() createDto: CreateUserDto) {
    const user = await this.usersService.create(createDto);
    // 不返回密码哈希
    const { passwordHash, ...result } = user;
    return result;
  }

  /**
   * 查询所有用户（分页）
   * 需要认证（默认）
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '查询用户列表', 
    description: '分页查询用户列表，支持排序、筛选和搜索。deleted 参数：false（默认，只显示未删除的）、true（只显示已删除的）、all（显示全部）' 
  })
  @ApiQuery({ type: QueryUserDto })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async findAll(@Query() queryDto: QueryUserDto) {
    const result = await this.usersService.findAll(queryDto);
    // 不返回密码哈希
    result.items = result.items.map(({ passwordHash, ...user }) => user);
    return result;
  }

  /**
   * 根据ID查询单个用户
   * 需要认证（默认）
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询单个用户', description: '根据用户ID查询用户详情' })
  @ApiParam({ name: 'id', description: '用户ID (UUID)' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    // 不返回密码哈希
    const { passwordHash, ...result } = user;
    return result;
  }

  /**
   * 更新用户
   * 需要认证（默认）
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @Permissions(USERS_PERMISSIONS.UPDATE, USERS_PERMISSIONS.WRITE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateDto);
    // 不返回密码哈希
    const { passwordHash, ...result } = user;
    return result;
  }

  /**
   * 删除用户
   * 需要管理员权限
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @Permissions(USERS_PERMISSIONS.DELETE, USERS_PERMISSIONS.WRITE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return null;
  }
}


