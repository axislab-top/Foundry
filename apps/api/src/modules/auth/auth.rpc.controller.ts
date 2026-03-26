import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service.js';

export interface AuthValidateRpcRequest {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
  traceparent?: string;
  tracestate?: string;
}

@Controller()
export class AuthRpcController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern('auth.validate')
  async validate(@Payload() req: AuthValidateRpcRequest) {
    return this.authService.validateCredentials(
      req.email,
      req.password,
      req.ip,
      req.userAgent,
    );
  }
}

