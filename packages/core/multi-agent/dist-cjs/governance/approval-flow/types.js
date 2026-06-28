"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalLevel = void 0;
var ApprovalLevel;
(function (ApprovalLevel) {
    /** Low risk: automatically approved (no human). */
    ApprovalLevel["AUTO"] = "auto";
    ApprovalLevel["DEPT_SUPERVISOR"] = "dept_supervisor";
    ApprovalLevel["CEO"] = "ceo";
    /** Highest level: real human decision required. */
    ApprovalLevel["BOARD"] = "board";
})(ApprovalLevel || (exports.ApprovalLevel = ApprovalLevel = {}));
