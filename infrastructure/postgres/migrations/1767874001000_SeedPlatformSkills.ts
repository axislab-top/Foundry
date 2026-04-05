import { MigrationInterface, QueryRunner } from 'typeorm';

/** Minimal JSON Schema object shape for OpenAI-style tools */
const schema = (props: Record<string, unknown>, required: string[] = []) =>
  JSON.stringify({
    type: 'object',
    properties: props,
    required,
  });

export class SeedPlatformSkills1767874001000 implements MigrationInterface {
  name = 'SeedPlatformSkills1767874001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{
      name: string;
      category: string;
      description: string;
      tool_schema: string;
      prompt_template: string;
      is_system: boolean;
    }> = [
      {
        name: 'echo',
        category: 'coding',
        description: 'Echo input back for testing tool wiring.',
        tool_schema: schema({ message: { type: 'string', description: 'Text to echo' } }),
        prompt_template: 'Use echo to verify the tool pipeline; pass a short message.',
        is_system: false,
      },
      {
        name: 'file-read',
        category: 'file',
        description: 'Read a file from allowed workspace paths.',
        tool_schema: schema({ path: { type: 'string', description: 'Relative path' } }, ['path']),
        prompt_template: 'Read file contents when the user references a path.',
        is_system: false,
      },
      {
        name: 'file-write',
        category: 'file',
        description: 'Write text to a file in the workspace.',
        tool_schema: schema({
          path: { type: 'string' },
          content: { type: 'string' },
        }),
        prompt_template: 'Persist generated content to a file.',
        is_system: false,
      },
      {
        name: 'web-search',
        category: 'search',
        description: 'Search the public web for current information.',
        tool_schema: schema({ query: { type: 'string' } }, ['query']),
        prompt_template: 'Search the web when facts may be outdated.',
        is_system: false,
      },
      {
        name: 'browser-search',
        category: 'browser',
        description: 'Browser-based navigation and search (sandboxed).',
        tool_schema: schema({ url: { type: 'string' }, action: { type: 'string' } }),
        prompt_template: 'Use for browser automation tasks.',
        is_system: false,
      },
      {
        name: 'code-run',
        category: 'coding',
        description: 'Run a snippet in a restricted sandbox.',
        tool_schema: schema({ language: { type: 'string' }, code: { type: 'string' } }),
        prompt_template: 'Execute small code samples safely.',
        is_system: false,
      },
      {
        name: 'http-request',
        category: 'external-api',
        description: 'Perform an HTTP request to an allowlisted host.',
        tool_schema: schema({
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          url: { type: 'string' },
          body: { type: 'string' },
        }),
        prompt_template: 'Call external HTTP APIs when permitted.',
        is_system: false,
      },
      {
        name: 'slack-send',
        category: 'communication',
        description: 'Send a message to a Slack channel (requires OAuth).',
        tool_schema: schema({ channel: { type: 'string' }, text: { type: 'string' } }),
        prompt_template: 'Notify a channel in Slack.',
        is_system: false,
      },
      {
        name: 'email-draft',
        category: 'communication',
        description: 'Draft an email (sensitive; may require approval).',
        tool_schema: schema({ to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }),
        prompt_template: 'Draft emails; human approval may be required before send.',
        is_system: false,
      },
      {
        name: 'finance-quote',
        category: 'finance',
        description: 'Fetch a market quote symbol (stub).',
        tool_schema: schema({ symbol: { type: 'string' } }, ['symbol']),
        prompt_template: 'Use for stock or FX quotes.',
        is_system: false,
      },
      {
        name: 'task-decompose',
        category: 'coding',
        description: 'System: break a goal into ordered subtasks.',
        tool_schema: schema({ goal: { type: 'string' } }, ['goal']),
        prompt_template: 'Decompose complex goals into steps.',
        is_system: true,
      },
      {
        name: 'heartbeat',
        category: 'external-api',
        description: 'System: lightweight health ping for orchestration.',
        tool_schema: schema({}),
        prompt_template: 'Internal heartbeat; rarely used by LLM directly.',
        is_system: true,
      },
      {
        name: 'github-create-issue',
        category: 'coding',
        description: 'Create a GitHub issue (token required).',
        tool_schema: schema({
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
        }),
        prompt_template: 'Track work in GitHub.',
        is_system: false,
      },
      {
        name: 'calendar-list',
        category: 'communication',
        description: 'List upcoming calendar events (integration stub).',
        tool_schema: schema({ from: { type: 'string' }, to: { type: 'string' } }),
        prompt_template: 'Check calendar availability.',
        is_system: false,
      },
      {
        name: 'notes-append',
        category: 'file',
        description: 'Append a line to a shared notes file.',
        tool_schema: schema({ note: { type: 'string' } }, ['note']),
        prompt_template: 'Append quick notes.',
        is_system: false,
      },
    ];

    for (const r of rows) {
      await queryRunner.query(
        `
        INSERT INTO skills (
          id,
          company_id,
          name,
          category,
          description,
          tool_schema,
          prompt_template,
          implementation_type,
          handler_config,
          required_permissions,
          version,
          is_public,
          is_system,
          metadata
        )
        SELECT
          gen_random_uuid(),
          NULL,
          $1::varchar(255),
          $2::varchar(120),
          $3::text,
          $4::jsonb,
          $5::text,
          'builtin',
          NULL,
          '[]'::jsonb,
          1,
          true,
          $6::boolean,
          NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM skills WHERE company_id IS NULL AND name = $1::varchar(255)
        )
      `,
        [r.name, r.category, r.description, r.tool_schema, r.prompt_template, r.is_system],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM skills
      WHERE company_id IS NULL
        AND name IN (
          'echo','file-read','file-write','web-search','browser-search','code-run',
          'http-request','slack-send','email-draft','finance-quote','task-decompose',
          'heartbeat','github-create-issue','calendar-list','notes-append'
        )
    `);
  }
}
