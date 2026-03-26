import { Injectable } from '@nestjs/common';
import { Logger } from '@service/logging';

@Injectable()
export class LoggerService {
  constructor(public readonly logger: Logger) {}
}










































