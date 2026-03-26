"use strict";
/**
 * Grafana Loki 传输器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLokiTransport = createLokiTransport;
const winston_loki_1 = __importDefault(require("winston-loki"));
const winston_1 = __importDefault(require("winston"));
/**
 * 创建 Loki 传输器
 */
function createLokiTransport(options = {}) {
    const { level = 'info', host = process.env.LOKI_URL || 'http://localhost:3100', labels = {}, batching = true, interval = 5 } = options;
    return new winston_loki_1.default({
        host,
        level,
        labels: {
            job: 'nodejs',
            ...labels
        },
        batching,
        interval,
        json: true,
        format: winston_1.default.format.json()
    });
}
//# sourceMappingURL=loki.transport.js.map