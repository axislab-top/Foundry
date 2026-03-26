/**
 * 全局类型声明
 */

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    SERVICE_NAME?: string;
    ELASTICSEARCH_URL?: string;
    LOKI_URL?: string;
  }
}











































