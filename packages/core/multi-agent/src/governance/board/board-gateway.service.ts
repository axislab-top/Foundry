import { Injectable } from '@nestjs/common';
import type { BoardDecision } from './board-decision.schema.js';

/**
 * Host-app adapter point: implement how "board decisions" are sent/received
 * (e.g., /admin-notify, /collaboration, email, etc.).
 */
@Injectable()
export class BoardGatewayService {
  async publishDecision(_decision: BoardDecision): Promise<void> {
    // Implemented in host app; kept as a stable DI token in core.
  }
}

