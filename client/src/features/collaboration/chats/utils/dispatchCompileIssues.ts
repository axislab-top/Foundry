export type DispatchCompileIssue = {
  code: string;
  path: string;
  message: string;
};

const CODE_HINT: Record<string, string> = {
  "parse.empty_document": "执行计划正文为空，请补充目标与部门分工。",
  "parse.missing_goal": "缺少「目标」段落，请在计划顶部写明要达成什么。",
  "parse.missing_assignments": "未解析到任何部门分工，请按模板填写各部门任务。",
  "parse.invalid_section": "计划章节格式有误，请检查 Markdown 标题与字段。",
  "compile.slug_not_allowed": "计划中出现了组织未配置的部门标识，请在侧栏表单改为已有部门。",
  "compile.empty_pool": "当前公司没有可指派的部门，请先在组织向导创建部门群。",
  "compile.dependency_unresolved": "依赖的部门标识不存在或拼写不一致，请核对 dependsOn 与部门 slug。",
};

export function humanizeCompileIssue(issue: DispatchCompileIssue): string {
  const hint = CODE_HINT[issue.code];
  if (hint) return hint;
  return issue.message?.trim() || issue.code || "编译校验未通过";
}

function readNestedMetadata(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const lsv2 = metadata.lightStructuredOutputV2;
  if (lsv2 && typeof lsv2 === "object" && !Array.isArray(lsv2)) {
    const inner = (lsv2 as Record<string, unknown>).metadata;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return metadata;
}

export function extractDispatchCompileIssues(
  metadata: Record<string, unknown> | null | undefined,
): DispatchCompileIssue[] | null {
  if (!metadata || typeof metadata !== "object") return null;
  const routePath = String(metadata.routePath ?? metadata.kind ?? "").trim();
  const nested = readNestedMetadata(metadata);
  const raw =
    metadata.dispatchCompileIssues ??
    nested?.dispatchCompileIssues ??
    (routePath === "dispatch_compile_failed" ? metadata.issues : null);

  if (!Array.isArray(raw) || raw.length === 0) {
    if (routePath === "dispatch_compile_failed") {
      const fallback = String(metadata.fastFinalText ?? nested?.fastFinalText ?? "").trim();
      if (fallback) {
        return [{ code: "dispatch_compile_failed", path: "", message: fallback }];
      }
    }
    return null;
  }

  const issues = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? "").trim();
      const message = String(row.message ?? "").trim();
      if (!code && !message) return null;
      return {
        code: code || "unknown",
        path: String(row.path ?? "").trim(),
        message: message || code,
      };
    })
    .filter((x): x is DispatchCompileIssue => Boolean(x));

  return issues.length ? issues : null;
}
