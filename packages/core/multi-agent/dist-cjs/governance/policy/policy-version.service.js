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
exports.PolicyVersionService = void 0;
const common_1 = require("@nestjs/common");
/**
 * Phase 5 MVP: policy version registry abstraction.
 *
 * Host apps should replace this with a durable store (DB + audit log).
 */
let PolicyVersionService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PolicyVersionService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PolicyVersionService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        byCompany = new Map();
        getCurrentVersion(companyId) {
            const list = this.byCompany.get(companyId) ?? [];
            return list.length ? list[list.length - 1].version : 1;
        }
        getSnapshot(companyId, version) {
            const list = this.byCompany.get(companyId) ?? [];
            return list.find((s) => s.version === version) ?? null;
        }
        list(companyId) {
            return [...(this.byCompany.get(companyId) ?? [])];
        }
        publishNewVersion(params) {
            const prev = this.getCurrentVersion(params.companyId);
            const next = Math.max(prev + 1, 2);
            const snap = {
                companyId: params.companyId,
                version: next,
                createdAt: Date.now(),
                createdBy: params.createdBy,
                policyJson: params.policyJson,
                reason: params.reason,
            };
            const list = this.byCompany.get(params.companyId) ?? [];
            list.push(snap);
            this.byCompany.set(params.companyId, list);
            return snap;
        }
        rollbackToVersion(params) {
            const snap = this.getSnapshot(params.companyId, params.version);
            if (!snap)
                return null;
            // In-memory MVP: rollback means "current version pointer" becomes target by truncation.
            const list = this.byCompany.get(params.companyId) ?? [];
            const idx = list.findIndex((s) => s.version === params.version);
            if (idx < 0)
                return null;
            this.byCompany.set(params.companyId, list.slice(0, idx + 1));
            return snap;
        }
    };
    return PolicyVersionService = _classThis;
})();
exports.PolicyVersionService = PolicyVersionService;
