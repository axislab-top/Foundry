"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtomicBindingService = void 0;
class AtomicBindingService {
    tx;
    port;
    constructor(tx, port) {
        this.tx = tx;
        this.port = port;
    }
    async executeWithApproval(approvalRequest, businessLogic) {
        await this.tx.begin();
        try {
            const approvalRecord = await this.port.createApprovalRecord(approvalRequest);
            const maybeTaskId = approvalRequest.payload?.taskId ?? '';
            if (maybeTaskId) {
                await this.port.markTaskBlocked(maybeTaskId, approvalRecord.approvalId);
            }
            const approved = await this.port.waitForApproval(approvalRecord.approvalId);
            if (!approved) {
                throw new Error(`Approval rejected: ${approvalRecord.approvalId}`);
            }
            const result = await businessLogic();
            await this.tx.commit();
            return result;
        }
        catch (error) {
            await this.tx.rollback();
            throw error;
        }
    }
}
exports.AtomicBindingService = AtomicBindingService;
