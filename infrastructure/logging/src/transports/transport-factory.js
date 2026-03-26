"use strict";
/**
 * 传输器工厂
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransport = createTransport;
const console_transport_1 = require("./console.transport");
const file_transport_1 = require("./file.transport");
const elasticsearch_transport_1 = require("./elasticsearch.transport");
const loki_transport_1 = require("./loki.transport");
/**
 * 创建传输器实例
 */
function createTransport(config) {
    switch (config.type) {
        case 'console':
            return (0, console_transport_1.createConsoleTransport)(config.options || {});
        case 'file':
            return (0, file_transport_1.createFileTransport)(config.options || {});
        case 'elasticsearch':
            return (0, elasticsearch_transport_1.createElasticsearchTransport)(config.options || {});
        case 'loki':
            return (0, loki_transport_1.createLokiTransport)(config.options || {});
        default:
            throw new Error(`Unknown transport type: ${config.type}`);
    }
}
//# sourceMappingURL=transport-factory.js.map