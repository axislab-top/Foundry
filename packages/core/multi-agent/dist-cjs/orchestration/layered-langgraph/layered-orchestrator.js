"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayeredLangGraphOrchestrator = void 0;
const agent_message_contract_js_1 = require("../../contracts/agent-message.contract.js");
const runtime_context_js_1 = require("../../runtime/runtime-context.js");
const ceo_orchestrator_graph_js_1 = require("./ceo-orchestrator.graph.js");
const dept_supervisor_graph_js_1 = require("./dept-supervisor.graph.js");
const specialist_execution_graph_js_1 = require("./specialist-execution.graph.js");
class LayeredLangGraphOrchestrator {
    dispatcher;
    constructor(dispatcher) {
        this.dispatcher = dispatcher;
    }
    async run(goal, initialContext) {
        return runtime_context_js_1.RuntimeContext.run(initialContext, async () => {
            const context = runtime_context_js_1.RuntimeContext.current();
            if (!context)
                throw new Error('Runtime context is missing');
            let state = await (0, ceo_orchestrator_graph_js_1.ceoBreakdownNode)({ goal, context });
            while (state.next !== 'end' && state.next !== 'human') {
                const toAgentId = state.nextLayerAgentId ??
                    (state.next === 'dept' ? 'dept-supervisor' : 'specialist-executor');
                const msg = (0, agent_message_contract_js_1.createAgentMessage)({
                    traceId: context.traceId,
                    fromAgentId: context.currentAgentId,
                    toAgentId,
                    intent: agent_message_contract_js_1.MessageIntent.TASK_DELEGATE,
                    payload: {
                        layer: state.next,
                        state: state.payload,
                    },
                    context: { companyId: context.companyId },
                });
                await this.dispatcher.dispatch(msg, context);
                context.emitTrace({
                    type: 'layered.dispatch',
                    layer: state.next,
                    toAgentId,
                    messageId: msg.messageId,
                });
                state =
                    state.next === 'dept'
                        ? await (0, dept_supervisor_graph_js_1.deptSuperviseNode)({
                            context,
                            payload: state.payload,
                        })
                        : await (0, specialist_execution_graph_js_1.specialistExecutionNode)({
                            context,
                            payload: state.payload,
                        });
            }
            context.emitTrace({ type: 'layered.completed', next: state.next });
            return state;
        });
    }
}
exports.LayeredLangGraphOrchestrator = LayeredLangGraphOrchestrator;
