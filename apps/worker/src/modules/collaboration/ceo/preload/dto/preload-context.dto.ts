export interface CeoPreloadContextDto {
  companyId: string;
  roomId: string;
  reason: 'message' | 'ceo_config' | 'budget' | 'agent' | 'manual';
}

