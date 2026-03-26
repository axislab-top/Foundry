"use strict";
/**
 * 日志查询引擎实现
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogQueryEngineImpl = void 0;
class LogQueryEngineImpl {
    constructor(maxEntries = 10000) {
        this.entries = [];
        this.maxEntries = maxEntries;
    }
    add(entry) {
        this.entries.push(entry);
        // 如果超过最大条目数，删除最旧的条目
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
    }
    query(query) {
        let results = [...this.entries];
        // 按日志级别过滤
        if (query.level) {
            const levels = Array.isArray(query.level) ? query.level : [query.level];
            results = results.filter(entry => levels.includes(entry.level));
        }
        // 按服务过滤
        if (query.service) {
            const services = Array.isArray(query.service) ? query.service : [query.service];
            results = results.filter(entry => entry.context?.service && services.includes(entry.context.service));
        }
        // 按消息内容过滤
        if (query.message) {
            results = results.filter(entry => entry.message.includes(query.message));
        }
        // 按正则表达式过滤
        if (query.messageRegex) {
            results = results.filter(entry => query.messageRegex.test(entry.message));
        }
        // 按上下文过滤
        if (query.context) {
            results = results.filter(entry => {
                if (!entry.context)
                    return false;
                return Object.entries(query.context).every(([key, value]) => entry.context[key] === value);
            });
        }
        // 按时间范围过滤
        if (query.timeRange) {
            const start = query.timeRange.start instanceof Date
                ? query.timeRange.start
                : new Date(query.timeRange.start);
            const end = query.timeRange.end instanceof Date
                ? query.timeRange.end
                : new Date(query.timeRange.end);
            results = results.filter(entry => {
                const entryTime = new Date(entry.timestamp);
                return entryTime >= start && entryTime <= end;
            });
        }
        // 按时间倒序排序（最新的在前）
        results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const total = results.length;
        const offset = query.offset || 0;
        const limit = query.limit || 100;
        const paginatedResults = results.slice(offset, offset + limit);
        return {
            entries: paginatedResults,
            total,
            hasMore: offset + limit < total
        };
    }
    clear() {
        this.entries = [];
    }
}
exports.LogQueryEngineImpl = LogQueryEngineImpl;
//# sourceMappingURL=query-engine.js.map