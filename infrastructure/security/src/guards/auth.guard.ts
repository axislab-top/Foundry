/**
 * 认证守卫（NestJS）
 * 
 * 注意：这是一个基础实现，实际使用时需要根据具体框架调整
 */

export interface AuthGuard {
  canActivate(context: any): boolean | Promise<boolean>;
}

/**
 * 基础认证守卫接口
 * 实际实现应该继承自 @nestjs/common 的 CanActivate
 */
export abstract class BaseAuthGuard implements AuthGuard {
  abstract canActivate(context: any): boolean | Promise<boolean>;
}






































