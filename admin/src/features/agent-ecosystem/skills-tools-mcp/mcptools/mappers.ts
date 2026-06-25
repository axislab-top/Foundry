import { parseObjectSchema } from '../tools/mappers';

export type McpCreateFormValues = {
  name: string;
  displayName?: string;
  description: string;
  serverRef: string;
  transport: 'stdio' | 'sse' | 'http';
  scope: 'company' | 'agent' | 'layer';
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  endpointUrl?: string;
  inputSchema: string;
  changeReason: string;
};

export type McpEditFormValues = {
  displayName?: string;
  description: string;
  serverRef?: string;
  endpointUrl?: string;
  transport: 'stdio' | 'sse' | 'http';
  scope: 'company' | 'agent' | 'layer';
  securityProfile: 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
  changeReason: string;
};

export function buildCreateMcpPayload(values: McpCreateFormValues) {
  return {
    name: values.name.trim(),
    displayName: values.displayName?.trim() || values.name.trim(),
    description: values.description.trim(),
    serverRef: values.serverRef.trim(),
    transport: values.transport,
    scope: values.scope,
    securityProfile: values.securityProfile,
    endpointUrl: values.endpointUrl?.trim() || null,
    inputSchema: parseObjectSchema(values.inputSchema),
    changeReason: values.changeReason.trim()
  };
}

export function buildEditMcpPayload(values: McpEditFormValues) {
  return {
    displayName: values.displayName?.trim() || undefined,
    description: values.description.trim(),
    serverRef: values.serverRef?.trim() || undefined,
    endpointUrl: values.endpointUrl?.trim() || null,
    transport: values.transport,
    scope: values.scope,
    securityProfile: values.securityProfile,
    changeReason: values.changeReason.trim()
  };
}
