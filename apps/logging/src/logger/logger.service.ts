import { Injectable } from '@nestjs/common';
import type { Logger } from '@service/logging';

@Injectable()
export class LoggerService {
  constructor(public readonly logger: Logger) {}
}










































