"use strict";
/**
 * 日志格式化器
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonFormatter = jsonFormatter;
exports.simpleFormatter = simpleFormatter;
exports.colorFormatter = colorFormatter;
const types_1 = require("./types");
/**
 * JSON 格式化器 - 输出结构化 JSON 日志
 */
function jsonFormatter(entry) {
    const logObject = {
        timestamp: entry.timestamp,
        level: entry.level.toUpperCase(),
        message: entry.message,
        ...entry.context,
        ...entry.metadata
    };
    if (entry.error) {
        logObject.error = {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack
        };
    }
    return JSON.stringify(logObject);
}
/**
 * 简洁格式化器 - 用于控制台输出
 */
function simpleFormatter(entry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const contextStr = entry.context
        ? Object.entries(entry.context)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')
        : '';
    let message = `${timestamp} [${level}] ${entry.message}`;
    if (contextStr) {
        message += ` ${contextStr}`;
    }
    if (entry.error) {
        message += `\n${entry.error.stack}`;
    }
    return message;
}
/**
 * 彩色格式化器 - 用于开发环境控制台
 */
function colorFormatter(entry) {
    const colors = {
        [types_1.LogLevel.ERROR]: '\x1b[31m', // Red
        [types_1.LogLevel.WARN]: '\x1b[33m', // Yellow
        [types_1.LogLevel.INFO]: '\x1b[36m', // Cyan
        [types_1.LogLevel.DEBUG]: '\x1b[35m', // Magenta
        [types_1.LogLevel.VERBOSE]: '\x1b[90m' // Gray
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level] || reset;
    return `${color}${simpleFormatter(entry)}${reset}`;
}
//# sourceMappingURL=formatters.js.map