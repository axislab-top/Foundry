"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ceoBreakdownNode = ceoBreakdownNode;
async function ceoBreakdownNode(input) {
    return {
        next: 'dept',
        payload: {
            goal: input.goal ?? '',
            sourceLayer: 'ceo',
        },
    };
}
