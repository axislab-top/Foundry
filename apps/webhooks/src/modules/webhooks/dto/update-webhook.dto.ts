import { PartialType } from '@nestjs/swagger';
import { CreateWebhookDto } from './create-webhook.dto.js';

export class UpdateWebhookDto extends PartialType(CreateWebhookDto) {}
