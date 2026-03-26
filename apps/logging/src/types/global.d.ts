/**
 * 全局类型声明
 */

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    PORT?: string;
    HOSTNAME?: string;
    ELASTICSEARCH_URL?: string;
    ELASTICSEARCH_INDEX_PREFIX?: string;
    LOKI_URL?: string;
    LOG_DIR?: string;
    SERVICE_NAME?: string;
  }
}











































