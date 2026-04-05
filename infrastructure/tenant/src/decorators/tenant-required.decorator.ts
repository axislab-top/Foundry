import { SetMetadata } from '@nestjs/common';
import { TENANT_REQUIRED_METADATA_KEY } from '../constants/tenant.constants.js';

export const TenantRequired = () =>
  SetMetadata(TENANT_REQUIRED_METADATA_KEY, true);

/** 显式不要求 Company ID（例如新建公司向导中上传 logo，此时尚未有租户上下文） */
export const TenantOptional = () =>
  SetMetadata(TENANT_REQUIRED_METADATA_KEY, false);
