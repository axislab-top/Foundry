"use strict";
/**
 * 结构化日志服务
 *
 * 提供统一的日志记录接口，支持多种传输方式
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.StructuredLoggerService = void 0;
exports.createLogger = createLogger;
const winston_1 = __importDefault(require("winston"));
const types_1 = require("./types");
const transport_factory_1 = require("./transports/transport-factory");
const console_transport_1 = require("./transports/console.transport");
/**
 * 结构化日志服务实现
 */
class StructuredLoggerService {
    constructor(config = {}) {
        this.config = {
            level: config.level || types_1.LogLevel.INFO,
            service: config.service || process.env.SERVICE_NAME || 'unknown',
            environment: config.environment || process.env.NODE_ENV || 'development',
            defaultContext: config.defaultContext || {},
            transports: config.transports || []
        };
        // 如果没有提供传输器，默认使用控制台传输器
        const transports = this.config.transports.length > 0
            ? this.config.transports.map(transport_factory_1.createTransport)
            : [(0, console_transport_1.createConsoleTransport)({ level: this.config.level })];
        this.logger = winston_1.default.createLogger({
            level: this.config.level,
            defaultMeta: {
                service: this.config.service,
                environment: this.config.environment,
                ...this.config.defaultContext
            },
            transports
        });
    }
    /**
     * 记录错误日志
     */
    error(message, context, error) {
        this.log(types_1.LogLevel.ERROR, message, context, error);
    }
    /**
     * 记录警告日志
     */
    warn(message, context) {
        this.log(types_1.LogLevel.WARN, message, context);
    }
    /**
     * 记录信息日志
     */
    info(message, context) {
        this.log(types_1.LogLevel.INFO, message, context);
    }
    /**
     * 记录调试日志
     */
    debug(message, context) {
        this.log(types_1.LogLevel.DEBUG, message, context);
    }
    /**
     * 记录详细日志
     */
    verbose(message, context) {
        this.log(types_1.LogLevel.VERBOSE, message, context);
    }
    /**
     * 通用日志记录方法
     */
    log(level, message, context, error) {
        const metadata = {
            ...this.config.defaultContext,
            ...context
        };
        if (error) {
            metadata.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }
        this.logger.log({
            level,
            message,
            context: metadata,
            metadata,
            error
        });
    }
    /**
     * 创建子日志器（继承默认上下文）
     */
    child(defaultContext) {
        const childConfig = {
            ...this.config,
            defaultContext: {
                ...this.config.defaultContext,
                ...defaultContext
            }
        };
        return new StructuredLoggerService(childConfig);
    }
    /**
     * 获取 Winston 日志器实例（用于高级用法）
     */
    getWinstonLogger() {
        return this.logger;
    }
}
exports.StructuredLoggerService = StructuredLoggerService;
/**
 * 创建日志器实例的便捷函数
 */
function createLogger(config) {
    return new StructuredLoggerService(config);
}
/**
 * 默认日志器实例
 */
exports.logger = createLogger();
//# sourceMappingURL=structured-logger.service.js.map