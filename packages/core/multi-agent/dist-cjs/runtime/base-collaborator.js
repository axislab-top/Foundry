"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseCollaborator = void 0;
/**
 * Base collaborator receives delegated agent messages and executes task work.
 */
class BaseCollaborator {
    context;
    constructor(context) {
        this.context = context;
    }
    async collaborate(message) {
        this.context.emitTrace({
            type: 'collaborator.start',
            messageId: message.messageId,
            intent: message.intent,
        });
        try {
            const output = await this.handle(message);
            this.context.emitTrace({
                type: 'collaborator.completed',
                messageId: message.messageId,
            });
            return { accepted: true, output };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.context.emitTrace({
                type: 'collaborator.failed',
                messageId: message.messageId,
                error: err.message,
            });
            return { accepted: false, error: err };
        }
    }
}
exports.BaseCollaborator = BaseCollaborator;
