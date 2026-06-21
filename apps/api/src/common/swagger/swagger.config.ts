import { DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '../config/config.service.js';

/**
 * Swagger 配置
 */
export function createSwaggerConfig(configService: ConfigService) {
  const appConfig = configService.getAppConfig();

  return new DocumentBuilder()
    .setTitle('API Service')
    .setDescription('API 服务文档 - 提供业务逻辑和数据操作接口')
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
    .addTag('users', '用户管理')
    .addTag('auth', '认证')
    .addTag('oauth', '第三方登录')
    .addTag('files', '文件管理')
    .addTag('health', '健康检查')
    .addTag('templates', '模板市场 / 一键创建公司')
    .setContact('Foundry Team', '', 'postmaster@axislab.top')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${appConfig.port}`, '本地开发环境')
    .addServer('https://your-domain.com', '生产环境（请替换为实际域名）')
    .build();
}































