export type ToolCreateFormValues = {
  name: string;
  displayName: string;
  description: string;
  implementationType?: 'builtin' | 'langgraph' | 'api' | 'external';
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  inputSchema: string;
  handlerConfig?: string;
  changeReason: string;
};

function parseJsonObject(inputText: string, fieldName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputText);
  } catch {
    throw new Error(`${fieldName} 必须是合法 JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 顶层必须是 JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function parseObjectSchema(schemaText: string): Record<string, unknown> {
  const parsed = parseJsonObject(schemaText, 'Input Schema');
  const rawType = parsed.type;
  const normalizedType =
    typeof rawType === 'string'
      ? rawType.trim().toLowerCase()
      : Array.isArray(rawType)
        ? rawType.map((item) => String(item).trim().toLowerCase())
        : null;

  const typeIncludesObject =
    normalizedType === 'object' ||
    (Array.isArray(normalizedType) && normalizedType.includes('object'));

  if (!typeIncludesObject) {
    throw new Error(
      `Input Schema 顶层 type 必须包含 object，当前为: ${JSON.stringify(rawType ?? null)}`
    );
  }
  return parsed;
}

function parseOptionalObjectSchema(schemaText: string): Record<string, unknown> | null {
  const text = String(schemaText ?? '').trim();
  if (!text) return null;
  return parseObjectSchema(text);
}

function parseOptionalJsonObject(schemaText: string, fieldName: string): Record<string, unknown> | null {
  const text = String(schemaText ?? '').trim();
  if (!text) return null;
  return parseJsonObject(text, fieldName);
}

function splitCsv(input: string): string[] {
  return String(input ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildCreateToolPayload(values: ToolCreateFormValues): Record<string, unknown> {
  const handlerConfig = parseOptionalJsonObject(values.handlerConfig ?? '', 'Handler Config');
  return {
    name: values.name.trim(),
    displayName: values.displayName.trim(),
    description: values.description.trim(),
    implementationType: values.implementationType ?? 'builtin',
    securityProfile: values.securityProfile,
    inputSchema: parseObjectSchema(values.inputSchema),
    handlerConfig,
    changeReason: values.changeReason.trim(),
    requiredPermissions: [],
    isEnabled: false
  };
}

export function isHighRiskProfile(profile: string): boolean {
  return profile === 'network' || profile === 'shell' || profile === 'dangerous';
}

export type ToolEditFormValues = {
  displayName: string;
  description: string;
  inputSchema: string;
  handlerConfig: string;
  outputSchema: string;
  requiredPermissionsCsv: string;
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  isEnabled: boolean;
  semverVersion?: string;
  changeReason: string;
};

export function buildUpdateToolPayload(values: ToolEditFormValues): Record<string, unknown> {
  return {
    displayName: values.displayName.trim(),
    description: values.description.trim(),
    inputSchema: parseObjectSchema(values.inputSchema),
    handlerConfig: parseOptionalJsonObject(values.handlerConfig, 'Handler Config'),
    outputSchema: parseOptionalObjectSchema(values.outputSchema),
    requiredPermissions: splitCsv(values.requiredPermissionsCsv),
    securityProfile: values.securityProfile,
    isEnabled: !!values.isEnabled,
    semverVersion: values.semverVersion ? String(values.semverVersion).trim() : undefined,
    changeReason: values.changeReason.trim()
  };
}
