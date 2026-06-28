"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deptSuperviseNode = deptSuperviseNode;
async function deptSuperviseNode(input) {
    return {
        next: 'specialist',
        payload: {
            ...(input.payload ?? {}),
            sourceLayer: 'dept',
        },
    };
}
