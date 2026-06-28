/**
 * 迁移后冒烟：验证 collaboration_programs 表可读写。
 * 用法：node infrastructure/migrations/scripts/verify-collaboration-programs.mjs
 */
import pg from 'pg';

const client = new pg.Client({
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.POSTGRES_PORT || 5432),
  user: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || process.env.POSTGRES_DB || 'service_db',
});

const companyId = '00000000-0000-4000-8000-000000000099';
const roomId = '00000000-0000-4000-8000-000000000098';
const messageId = '00000000-0000-4000-8000-000000000097';

async function main() {
  await client.connect();

  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'collaboration_programs' ORDER BY ordinal_position`,
  );
  if (cols.rows.length < 12) {
    throw new Error(`collaboration_programs 列数异常: ${cols.rows.length}`);
  }

  const orchCol = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'collaboration_orchestration_runs' AND column_name = 'program_id'`,
  );
  if (orchCol.rows.length === 0) {
    throw new Error('collaboration_orchestration_runs.program_id 缺失');
  }

  const mig = await client.query(
    `SELECT name FROM migrations WHERE name LIKE '%CollaborationProgram%'`,
  );
  if (mig.rows.length === 0) {
    throw new Error('migrations 表无 CollaborationProgram 记录');
  }

  await client.query(
    `DELETE FROM collaboration_programs WHERE company_id = $1 AND room_id = $2`,
    [companyId, roomId],
  );

  const brief = {
    deliverableType: 'analysis_report',
    title: '化妆品未来付费意愿分析报告',
    audience: '营销团队',
    timeframe: '1年',
    persona: '全人群',
    purpose: '寻找增长点',
    completeness: 1,
    missingFields: [],
  };

  const inserted = await client.query(
    `INSERT INTO collaboration_programs
      (company_id, room_id, thread_id, source_message_id, phase, brief)
     VALUES ($1, $2, 'main', $3, 'aligning', $4::jsonb)
     RETURNING id, phase, brief`,
    [companyId, roomId, messageId, JSON.stringify(brief)],
  );
  const programId = inserted.rows[0].id;

  await client.query(
    `UPDATE collaboration_programs SET phase = 'dept_executing', updated_at = NOW() WHERE id = $1`,
    [programId],
  );

  const active = await client.query(
    `SELECT id, phase FROM collaboration_programs
     WHERE company_id = $1 AND room_id = $2 AND phase NOT IN ('delivered','failed','cancelled','idle')
     ORDER BY updated_at DESC LIMIT 1`,
    [companyId, roomId],
  );
  if (active.rows[0]?.phase !== 'dept_executing') {
    throw new Error(`phase 更新失败: ${active.rows[0]?.phase}`);
  }

  await client.query(`DELETE FROM collaboration_programs WHERE id = $1`, [programId]);

  console.log('OK collaboration_programs 迁移验证通过');
  console.log('  - 表结构:', cols.rows.length, '列');
  console.log('  - orchestration_runs.program_id: 存在');
  console.log('  - 迁移记录:', mig.rows.map((r) => r.name).join(', '));
  console.log('  - CRUD 冒烟: insert → update → query → delete 成功');
}

main()
  .catch((err) => {
    console.error('FAIL', err.message || err);
    process.exit(1);
  })
  .finally(() => client.end());
