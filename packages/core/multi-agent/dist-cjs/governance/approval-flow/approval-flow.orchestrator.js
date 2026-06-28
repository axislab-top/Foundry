"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalFlowOrchestrator = void 0;
const common_1 = require("@nestjs/common");
const types_js_1 = require("./types.js");
const runtime_context_js_1 = require("../../runtime/runtime-context.js");
/**
 * Phase 5: real orchestration loop with an explicit flow cursor + status.
 *
 * Persistence is delegated to the host app (DB/Redis/event sourcing). This class is pure orchestration.
 */
let ApprovalFlowOrchestrator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalFlowOrchestrator = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalFlowOrchestrator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        store;
        executor;
        logger = new common_1.Logger(ApprovalFlowOrchestrator.name);
        constructor(store, executor) {
            this.store = store;
            this.executor = executor;
        }
        async startAndRun(initialFlow, options) {
            await this.store.save(initialFlow);
            return await this.execute(initialFlow, options);
        }
        async execute(flow, options) {
            const ctx = runtime_context_js_1.RuntimeContext.current();
            if (!ctx) {
                throw new Error('Runtime context missing in ApprovalFlowOrchestrator');
            }
            // terminal guard
            if (flow.status !== 'running')
                return flow;
            await this.store.update(flow);
            while (flow.currentIndex < flow.levels.length) {
                const step = flow.levels[flow.currentIndex];
                if (step.status !== 'pending') {
                    flow.currentIndex++;
                    await this.store.updateStatus(flow.approvalFlowId, flow.status, flow.currentIndex);
                    continue;
                }
                ctx.emitTrace?.({
                    type: 'approval.step.start',
                    flowId: flow.approvalFlowId,
                    index: flow.currentIndex,
                    level: step.level,
                });
                const group = this.collectParallelGroup(flow, flow.currentIndex);
                // Phase 5: persist step->approvalId before waiting, to be restart-safe.
                for (const idx of group.indexes) {
                    await this.executor.prepareStep(flow, idx);
                }
                await this.store.update(flow);
                const results = await Promise.all(group.indexes.map((idx) => this.executor.executeStep(flow, idx)));
                const rejected = results.find((r) => r.status === 'rejected');
                if (rejected) {
                    this.applyStepResult(flow, rejected.index, rejected);
                    flow.status = 'rejected';
                    flow.currentLevel = step.level;
                    await this.store.update(flow);
                    ctx.emitTrace?.({ type: 'approval.flow.rejected', flowId: flow.approvalFlowId, index: rejected.index });
                    return flow;
                }
                const timedOut = results.find((r) => r.status === 'timeout');
                if (timedOut) {
                    this.applyStepResult(flow, timedOut.index, timedOut);
                    if (options?.autoEscalateOnTimeout && step.escalateTo) {
                        // mark current step as skipped and insert escalation step if missing
                        flow.levels[timedOut.index].status = 'skipped';
                        this.insertEscalationIfNeeded(flow, step.escalateTo, timedOut.index + 1);
                        await this.store.update(flow);
                        ctx.emitTrace?.({
                            type: 'approval.step.escalated',
                            flowId: flow.approvalFlowId,
                            fromLevel: step.level,
                            toLevel: step.escalateTo,
                        });
                        continue;
                    }
                    flow.status = 'expired';
                    await this.store.update(flow);
                    ctx.emitTrace?.({ type: 'approval.flow.expired', flowId: flow.approvalFlowId });
                    return flow;
                }
                // all approved (or skipped) in group
                for (const r of results) {
                    this.applyStepResult(flow, r.index, r);
                }
                flow.currentIndex = group.nextIndex;
                await this.store.update(flow);
            }
            // fully approved
            flow.status = 'approved';
            flow.currentLevel = types_js_1.ApprovalLevel.AUTO;
            await this.store.update(flow);
            ctx.emitTrace?.({ type: 'approval.flow.approved', flowId: flow.approvalFlowId });
            this.logger.log('Approval flow approved', { flowId: flow.approvalFlowId, traceId: flow.traceId });
            return flow;
        }
        applyStepResult(flow, index, result) {
            const step = flow.levels[index];
            if (!step)
                return;
            if (result.status === 'approved') {
                step.status = 'approved';
                step.approvedAt = Date.now();
                step.reason = undefined;
                return;
            }
            if (result.status === 'rejected') {
                step.status = 'rejected';
                step.reason = result.reason;
                return;
            }
            if (result.status === 'timeout') {
                step.status = 'rejected';
                step.reason = result.reason ?? 'timeout';
                return;
            }
        }
        collectParallelGroup(flow, startIndex) {
            const first = flow.levels[startIndex];
            if (!first?.groupId)
                return { indexes: [startIndex], nextIndex: startIndex + 1 };
            const indexes = [];
            for (let i = startIndex; i < flow.levels.length; i++) {
                const s = flow.levels[i];
                if (s.groupId !== first.groupId)
                    break;
                if (s.status === 'pending')
                    indexes.push(i);
            }
            return { indexes: indexes.length ? indexes : [startIndex], nextIndex: startIndex + 1 + (indexes.length ? indexes.length - 1 : 0) };
        }
        insertEscalationIfNeeded(flow, level, atIndex) {
            const exists = flow.levels.some((s) => s.level === level && s.status === 'pending');
            if (exists)
                return;
            flow.levels.splice(atIndex, 0, { level, approver: 'human', status: 'pending' });
        }
    };
    return ApprovalFlowOrchestrator = _classThis;
})();
exports.ApprovalFlowOrchestrator = ApprovalFlowOrchestrator;
