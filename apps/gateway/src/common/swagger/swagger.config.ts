import { DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '../config/config.service.js';

/**
 * Swagger 配置
 */
export function createSwaggerConfig(configService: ConfigService) {
  const appConfig = configService.getAppConfig();

  return new DocumentBuilder()
    .setTitle('Gateway Service')
    .setDescription('API 网关服务文档 - 提供统一入口、认证、路由转发等功能')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: '输入 JWT token',
        in: 'header',
      },
      'JWT-auth', // 这个名称用于在控制器中使用 @ApiBearerAuth('JWT-auth')
    )
    .addTag('auth', '认证')
    .addTag('admin/api-keys', 'API 密钥管理')
    .addTag('admin/routes', '路由管理')
    .addTag('admin/ip-filter', 'IP 过滤管理')
    .addTag('admin/audit', '审计日志')
    .addTag('health', '健康检查')
    .setContact('Foundry Team', '', 'postmaster@axislab.top')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${appConfig.port}`, '本地开发环境')
    .addServer('https://your-domain.com', '生产环境（请替换为实际域名）')
    .build();
}































