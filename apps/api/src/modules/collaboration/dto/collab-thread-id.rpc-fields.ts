import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { COLLABORATION_THREAD_ID_PATTERN } from '@contracts/types';

/** RPC / HTTP 共用的 threadId 字段：允许省略、`main` sentinel、或 UUID。 */
export function IsCollaborationThreadIdOptional() {
  return applyDecorators(
    IsOptional(),
    IsString(),
    MaxLength(128),
    Matches(COLLABORATION_THREAD_ID_PATTERN, {
      message: 'threadId must be "main" or a UUID',
    }),
  );
}
