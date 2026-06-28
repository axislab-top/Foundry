import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '@service/messaging';
import {
  COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
  EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
  type EmployeeTaskProposedEvent,
  type TaskDelegationRequestedEvent,
} from '@contracts/events';
import { CollaborationTaskDelegationPersistService } from '../collaboration-task-delegation-persist.service.js';

/**
 * Phase 3：将 `collaboration.task-delegation.requested` / `employee.task.propose` 落库为 agent 子任务。
 */
@Injectable()
export class CollaborationTaskDelegationListener implements OnModuleInit {
  private readonly logger = new Logger(CollaborationTaskDelegationListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly persist: CollaborationTaskDelegationPersistService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<TaskDelegationRequestedEvent>(
      COLLABORATION_TASK_DELEGATION_REQUESTED_ROUTING_KEY,
      (event) => this.persist.persistDelegationRequested(event),
      {
        queue: 'worker-collaboration-task-delegation-requested',
        durable: true,
        prefetchCount: 10,
      },
    );

    this.messaging.subscribeWithBackoff<EmployeeTaskProposedEvent>(
      EMPLOYEE_TASK_PROPOSE_ROUTING_KEY,
      (event) => this.persist.persistEmployeeTaskProposed(event),
      {
        queue: 'worker-employee-task-propose',
        durable: true,
        prefetchCount: 10,
      },
    );

    this.logger.log('collaboration.task_delegation.listeners_registered');
  }
}
