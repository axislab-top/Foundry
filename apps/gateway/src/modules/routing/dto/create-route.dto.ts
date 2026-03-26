import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsIn,
  IsNumber,
} from 'class-validator';

/**
 * 创建路由DTO
 */
export class CreateRouteDto {
  /**
   * 路由路径
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  path: string;

  /**
   * 目标服务
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  service: string;

  /**
   * 路径重写规则
   */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  rewritePath?: string;

  /**
   * 是否需要认证
   */
  @IsBoolean()
  @IsOptional()
  authRequired?: boolean;

  /**
   * 优先级
   */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(1000)
  priority?: number;

  /**
   * 描述
   */
  @IsString()
  @IsOptional()
  description?: string;

  /**
   * 传输方式（http / rpc）
   */
  @IsString()
  @IsOptional()
  @IsIn(['http', 'rpc'])
  transport?: 'http' | 'rpc';

  /**
   * RPC client 名称（当前仅支持 api）
   */
  @IsString()
  @IsOptional()
  @IsIn(['api', 'webhooks'])
  rpcClientName?: 'api' | 'webhooks';

  /**
   * RPC pattern（例如 auth.validate）
   */
  @IsString()
  @IsOptional()
  @MaxLength(128)
  rpcPattern?: string;

  /**
   * RPC timeout（毫秒）
   */
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(300000)
  rpcTimeoutMs?: number;
}


































