import {
  normalizeRoomCollaborationMode,
  readCollaborationModeFromRoomPayload,
} from './room-context-collaboration-mode.util.js';

describe('room-context-collaboration-mode.util', () => {
  describe('normalizeRoomCollaborationMode', () => {
    it('accepts known modes', () => {
      expect(normalizeRoomCollaborationMode('execution')).toBe('execution');
      expect(normalizeRoomCollaborationMode('discussion')).toBe('discussion');
      expect(normalizeRoomCollaborationMode('direct')).toBe('direct');
      expect(normalizeRoomCollaborationMode('approval_wait')).toBe('approval_wait');
    });

    it('trims whitespace', () => {
      expect(normalizeRoomCollaborationMode('  execution  ')).toBe('execution');
    });

    it('falls back to discussion for unknown or empty', () => {
      expect(normalizeRoomCollaborationMode(undefined)).toBe('discussion');
      expect(normalizeRoomCollaborationMode(null)).toBe('discussion');
      expect(normalizeRoomCollaborationMode('')).toBe('discussion');
      expect(normalizeRoomCollaborationMode('unknown-mode')).toBe('discussion');
    });
  });

  describe('readCollaborationModeFromRoomPayload', () => {
    it('returns undefined for null/undefined', () => {
      expect(readCollaborationModeFromRoomPayload(null)).toBeUndefined();
      expect(readCollaborationModeFromRoomPayload(undefined)).toBeUndefined();
    });

    it('prefers camelCase collaborationMode', () => {
      expect(
        readCollaborationModeFromRoomPayload({
          collaborationMode: 'execution',
          collaboration_mode: 'discussion',
        }),
      ).toBe('execution');
    });

    it('reads snake_case when camelCase absent', () => {
      expect(readCollaborationModeFromRoomPayload({ collaboration_mode: 'execution' })).toBe('execution');
    });

    it('returns undefined when both keys absent', () => {
      expect(readCollaborationModeFromRoomPayload({ id: 'r1', roomType: 'main' })).toBeUndefined();
    });

    it('ignores null field values and falls through to snake_case', () => {
      expect(
        readCollaborationModeFromRoomPayload({
          collaborationMode: null,
          collaboration_mode: 'execution',
        }),
      ).toBe('execution');
    });
  });
});
