import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupervisorLesson } from '../entities/supervisor-lesson.entity.js';

export interface SupervisorLessonListItem {
  id: string;
  runId: string;
  taskId: string | null;
  failureSignatureHash: string;
  rootCause: string;
  lesson: string;
  preventiveAction: string;
  confidence: number;
  ingestedToMemory: boolean;
  isRepeatPattern: boolean;
  createdAt: string;
}

@Injectable()
export class SupervisorLessonQueryService {
  constructor(
    @InjectRepository(SupervisorLesson)
    private readonly lessonsRepo: Repository<SupervisorLesson>,
  ) {}

  async listRecent(companyId: string, limit = 20): Promise<SupervisorLessonListItem[]> {
    const cap = Math.min(Math.max(limit, 1), 100);
    const rows = await this.lessonsRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: cap,
    });
    return rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      taskId: r.taskId,
      failureSignatureHash: r.failureSignatureHash,
      rootCause: r.rootCause,
      lesson: r.lesson,
      preventiveAction: r.preventiveAction,
      confidence: r.confidence,
      ingestedToMemory: r.ingestedToMemory,
      isRepeatPattern: r.isRepeatPattern,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
