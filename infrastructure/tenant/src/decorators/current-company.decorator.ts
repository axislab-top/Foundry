import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TENANT_CLS_COMPANY_ID } from '../constants/tenant.constants.js';

export const CurrentCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.companyId || request.cls?.get(TENANT_CLS_COMPANY_ID);
  },
);
