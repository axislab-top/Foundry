import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * skill_execution_logs.trace_id：64 字符不足以容纳部分 W3C traceparent / 自定义串联 trace 字符串，导致 skill.executed 落库失败。
 */
export class WidenSkillExecutionLogTraceId1772400000000 implements MigrationInterface {
  name = 'WidenSkillExecutionLogTraceId1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skill_execution_logs
      ALTER COLUMN trace_id TYPE VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE skill_execution_logs
      ALTER COLUMN trace_id TYPE VARCHAR(64)
      USING LEFT(trace_id, 64)
    `);
  }
}
