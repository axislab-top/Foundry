"use strict";
/**
 * 控制台传输器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConsoleTransport = createConsoleTransport;
const winston_1 = __importDefault(require("winston"));
const formatters_1 = require("../formatters");
/**
 * 创建控制台传输器
 */
function createConsoleTransport(options = {}) {
    const { level, colorize = true, json = false } = options;
    return new winston_1.default.transports.Console({
        level: level || 'info',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.printf((info) => {
            const entry = {
                level: info.level,
                message: info.message,
                timestamp: info.timestamp,
                context: info.context,
                error: info.error,
                metadata: info.metadata
            };
            if (json) {
                // 如果需要 JSON 格式，可以使用 winston 的 json 格式化器
                return JSON.stringify({
                    timestamp: entry.timestamp,
                    level: entry.level,
                    message: entry.message,
                    ...entry.context,
                    ...entry.metadata,
                    ...(entry.error && {
                        error: {
                            name: entry.error.name,
                            message: entry.error.message,
                            stack: entry.error.stack
                        }
                    })
                });
            }
            return colorize ? (0, formatters_1.colorFormatter)(entry) : (0, formatters_1.simpleFormatter)(entry);
        }))
    });
}
//# sourceMappingURL=console.transport.js.map