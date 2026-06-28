"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompensationEvent = createCompensationEvent;
function createCompensationEvent(params) {
    return {
        traceId: params.traceId,
        action: params.action,
        reason: params.reason,
        occurredAt: new Date().toISOString(),
        timestamp: Date.now(),
        metadata: params.metadata,
    };
}
