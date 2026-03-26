"use strict";
/**
 * Elasticsearch 传输器
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createElasticsearchTransport = createElasticsearchTransport;
const winston_elasticsearch_1 = __importDefault(require("winston-elasticsearch"));
const winston_1 = __importDefault(require("winston"));
/**
 * 创建 Elasticsearch 传输器
 */
function createElasticsearchTransport(options = {}) {
    const { level = 'info', clientOpts = {
        node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
    }, index = 'logs', indexPrefix = index, indexSuffixPattern = 'YYYY.MM.DD' } = options;
    return new winston_elasticsearch_1.default({
        level,
        clientOpts,
        indexPrefix,
        indexSuffixPattern,
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json())
    });
}
//# sourceMappingURL=elasticsearch.transport.js.map