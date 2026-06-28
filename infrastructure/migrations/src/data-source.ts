import { DataSource, DataSourceOptions } from 'typeorm';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取数据库配置
 * 支持两种环境变量命名（按优先级）：
 * 1. DB_* - 用于应用程序和迁移工具（优先）
 * 2. POSTGRES_* - 用于 Docker Compose（回退）
 * 
 * 注意：如果只有 POSTGRES_* 变量，代码会自动使用它们
 */
async function getDatabaseConfig() {
  // 直接从 process.env 读取，确保能获取到所有环境变量
  // 优先使用 DB_*，如果没有则使用 POSTGRES_*
  const host = process.env.DB_HOST || 
                process.env.POSTGRES_HOST || 
                'localhost';
  
  const port = process.env.DB_PORT 
                ? parseInt(process.env.DB_PORT, 10)
                : (process.env.POSTGRES_PORT 
                    ? parseInt(process.env.POSTGRES_PORT, 10) 
                    : 5432);
  
  const username = process.env.DB_USERNAME || 
                   process.env.POSTGRES_USER || 
                   'postgres';
  
  const password = process.env.DB_PASSWORD || 
                   process.env.POSTGRES_PASSWORD || 
                   'postgres';
  
  const database = process.env.DB_DATABASE || 
                    process.env.POSTGRES_DB || 
                    'service_db';

  return {
    host,
    port,
    username,
    password,
    database,
  };
}

/**
 * 获取项目根目录
 * 从 infrastructure/migrations 目录向上两级到达项目根目录
 */
function getProjectRoot(): string {
  // 如果设置了环境变量，使用它
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }
  
  // 从当前文件位置计算项目根目录
  // infrastructure/migrations/src/data-source.ts -> 向上两级 -> 项目根目录
  const currentDir = __dirname; // infrastructure/migrations/dist
  const migrationsDir = path.dirname(currentDir); // infrastructure/migrations
  const infrastructureDir = path.dirname(migrationsDir); // infrastructure
  const projectRoot = path.dirname(infrastructureDir); // 项目根目录
  
  return projectRoot;
}

/**
 * 创建数据源配置
 */
export async function createDataSourceOptions(): Promise<DataSourceOptions> {
  const dbConfig = await getDatabaseConfig();
  const projectRoot = getProjectRoot();

  // 迁移文件路径（支持多目录）：
  // - MIGRATIONS_DIRS: 逗号分隔目录列表（最高优先级）
  // - MIGRATIONS_DIR: 单目录（兼容旧配置）
  // - 默认: infrastructure/postgres/migrations
  const migrationsDirListRaw = String(process.env.MIGRATIONS_DIRS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const migrationsDirList = migrationsDirListRaw.map((p) => path.resolve(projectRoot, p));
  const singleMigrationsDir = process.env.MIGRATIONS_DIR
    ? path.resolve(projectRoot, process.env.MIGRATIONS_DIR)
    : path.resolve(projectRoot, 'infrastructure/postgres/migrations-post-baseline');
  const defaultMigrationDirs = [
    // Baseline migrations (initial schema snapshots)
    path.resolve(projectRoot, 'infrastructure/postgres/migrations-baseline'),
    // Incremental migrations after baseline rollout (must NOT include historical migrations)
    path.resolve(projectRoot, 'infrastructure/postgres/migrations-post-baseline'),
  ];
  // If MIGRATIONS_DIRS is set (often baseline-only), we still need to include
  // post-baseline incremental migrations by default.
  const postBaselineDir = path.resolve(projectRoot, 'infrastructure/postgres/migrations-post-baseline');
  const resolvedMigrationDirs =
    migrationsDirList.length > 0
      ? (() => {
          const set = new Set(migrationsDirList.map((p) => path.normalize(p)));
          set.add(path.normalize(postBaselineDir));
          return [...set];
        })()
      : process.env.MIGRATIONS_DIR
        ? [singleMigrationsDir]
        : defaultMigrationDirs;
  const migrationPatterns = resolvedMigrationDirs.map((dir) => path.join(dir, '*.{ts,js}'));

  // 实体路径 - 从API服务加载实体（用于生成迁移）
  // 注意：生成迁移时需要加载实体，运行时不需要
  const entitiesPattern = process.env.ENTITIES_DIR || 
    'apps/api/src/modules/**/entities/*.entity.{ts,js}';
  const entitiesDir = path.resolve(projectRoot, entitiesPattern);

  return {
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    
    // 迁移配置
    // 注意：如果迁移文件是 .ts，需要使用 tsx 或 ts-node 来运行
    // 例如：tsx dist/cli.js migration:run
    // 或者先编译迁移文件为 .js
    migrations: migrationPatterns,
    migrationsTableName: 'migrations',
    migrationsRun: false, // 不自动运行迁移
    
    // 实体配置（用于生成迁移，运行时不需要）
    // 注意：TypeORM CLI需要实体来生成迁移，但运行迁移时不需要
    // 默认不加载实体，除非明确设置 TYPEORM_ENTITIES=true
    entities: process.env.TYPEORM_ENTITIES === 'true' ? [entitiesDir] : [],
    
    // 其他配置
    logging: process.env.DB_LOGGING === 'true',
    synchronize: false, // 生产环境必须为false
  };
}

/**
 * 创建数据源实例
 */
export async function createDataSource(): Promise<DataSource> {
  const options = await createDataSourceOptions();
  return new DataSource(options);
}

// 导出默认数据源（用于TypeORM CLI）
// TypeORM CLI 支持 Promise<DataSource> 作为默认导出
export default createDataSource();

