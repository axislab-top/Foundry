"use strict";
/**
 * @service/logging - 统一的结构化日志库
 *
 * 导出所有公共 API
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
__exportStar(require("./structured-logger.service"), exports);
__exportStar(require("./transports"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./formatters"), exports);
__exportStar(require("./aggregators"), exports);
__exportStar(require("./queries"), exports);
//# sourceMappingURL=index.js.map