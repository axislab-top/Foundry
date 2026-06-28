import { Injectable } from '@nestjs/common';
import type { CompanyMembershipRole } from '../../companies/entities/company-membership.entity.js';

export type CollaborationPrincipalRole = 'ceo' | 'supervisor' | 'member' | 'assistant';
export type CollaborationRouteTarget = 'self' | 'team' | 'department' | 'company' | 'escalation';
export type CollaborationVisibilityScope = 'self' | 'direct_reports' | 'department' | 'company' | 'executive';

@Injectable()
export class CollaborationRoleRoutingService {
  isLeader(role: CompanyMembershipRole | null | undefined): boolean {
    return role === 'owner' || role === 'admin' || role === 'supervisor';
  }

  toPrincipalRole(role: CompanyMembershipRole | null | undefined): CollaborationPrincipalRole {
    if (role === 'owner') return 'ceo';
    if (role === 'admin' || role === 'supervisor') return 'supervisor';
    return 'member';
  }

  resolveDefaultRoute(params: {
    principalRole: CollaborationPrincipalRole;
    roomType: string;
    messageCategory: string;
  }): CollaborationRouteTarget {
    if (params.messageCategory === 'upgrade_request') return 'escalation';
    if (params.messageCategory === 'task_publish') {
      return params.principalRole === 'ceo' ? 'company' : 'department';
    }
    if (params.roomType === 'main') return 'company';
    if (params.roomType === 'department') return 'department';
    return 'team';
  }

  resolveVisibilityScope(params: {
    principalRole: CollaborationPrincipalRole;
    routeTarget: CollaborationRouteTarget;
    isEscalation: boolean;
  }): CollaborationVisibilityScope {
    if (params.isEscalation) {
      return params.principalRole === 'ceo' ? 'executive' : 'department';
    }
    switch (params.routeTarget) {
      case 'company':
        return params.principalRole === 'ceo' ? 'company' : 'department';
      case 'department':
        return 'department';
      case 'team':
        return 'direct_reports';
      case 'escalation':
        return 'executive';
      case 'self':
      default:
        return 'self';
    }
  }
}
