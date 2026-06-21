import * as Joi from 'joi';

export const runnerEnvSchema = Joi.object({
  RMQ_URL: Joi.string().default('amqp://guest:guest@localhost:5672'),
  RUNNER_RMQ_QUEUE: Joi.string().default('runner-rpc-queue'),
  RUNNER_HTTP_PORT: Joi.number().default(3010),
  RUNNER_EXEC_MODE: Joi.string().valid('mock', 'kubernetes').default('mock'),
  RUNNER_K8S_NAMESPACE: Joi.string().default('foundry-runner'),
  RUNNER_GVISOR_RUNTIME_CLASS: Joi.string().default('gvisor'),
  RUNNER_JOB_IMAGE: Joi.string().default('busybox:1.36'),
  RUNNER_JOB_ACTIVE_DEADLINE_SEC: Joi.number().default(3600),
  API_RMQ_RPC_QUEUE: Joi.string().default('api-rpc-queue'),
  RUNNER_SYSTEM_ACTOR_ID: Joi.string()
    .uuid()
    .default('00000000-0000-4000-8000-000000000001'),
}).unknown(true);

export type RunnerEnv = {
  RMQ_URL: string;
  RUNNER_RMQ_QUEUE: string;
  RUNNER_HTTP_PORT: number;
  RUNNER_EXEC_MODE: 'mock' | 'kubernetes';
  RUNNER_K8S_NAMESPACE: string;
  RUNNER_GVISOR_RUNTIME_CLASS: string;
  RUNNER_JOB_IMAGE: string;
  RUNNER_JOB_ACTIVE_DEADLINE_SEC: number;
  API_RMQ_RPC_QUEUE: string;
  RUNNER_SYSTEM_ACTOR_ID: string;
};
