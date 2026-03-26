"use strict";
/**
 * 日志传输器
 *
 * 提供多种日志输出方式：
 * - Console: 控制台输出
 * - File: 文件输出
 * - Elasticsearch: 发送到 Elasticsearch
 * - Loki: 发送到 Grafana Loki
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./console.transport"), exports);
__exportStar(require("./file.transport"), exports);
__exportStar(require("./elasticsearch.transport"), exports);
__exportStar(require("./loki.transport"), exports);
__exportStar(require("./transport-factory"), exports);
//# sourceMappingURL=index.js.map