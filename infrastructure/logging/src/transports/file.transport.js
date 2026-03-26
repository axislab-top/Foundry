"use strict";
/**
 * 文件传输器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileTransport = createFileTransport;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
/**
 * 创建文件传输器
 */
function createFileTransport(options = {}) {
    const { level = 'info', filename = 'app.log', dirname = './logs', maxsize = 10 * 1024 * 1024, // 10MB
    maxFiles = 5 } = options;
    return new winston_1.default.transports.File({
        level,
        filename: path_1.default.join(dirname, filename),
        maxsize,
        maxFiles,
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json())
    });
}
//# sourceMappingURL=file.transport.js.map