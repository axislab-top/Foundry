/**
 * Express 类型导入辅助文件
 * 解决 ESM 模式下导入 CommonJS 模块的问题
 * 使用默认导入然后提取类型
 */
import type express from 'express';

// 类型导出
export type Request = express.Request;
export type Response = express.Response;
export type NextFunction = express.NextFunction;

