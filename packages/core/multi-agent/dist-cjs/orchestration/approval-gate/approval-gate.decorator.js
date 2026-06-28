"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireApproval = void 0;
const common_1 = require("@nestjs/common");
const approval_contract_js_1 = require("../../contracts/approval.contract.js");
const types_js_1 = require("./types.js");
const RequireApproval = (options = {}) => (0, common_1.SetMetadata)(types_js_1.REQUIRE_APPROVAL, {
    riskLevel: options.riskLevel ?? approval_contract_js_1.RiskLevel.HIGH,
    action: options.action,
    policyRef: options.policyRef,
});
exports.RequireApproval = RequireApproval;
