"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.specialistExecutionNode = specialistExecutionNode;
async function specialistExecutionNode(input) {
    return {
        next: 'end',
        payload: {
            ...(input.payload ?? {}),
            sourceLayer: 'specialist',
            status: 'completed',
        },
    };
}
