import { repairAudienceRoutingModelJson } from './audience-routing-json-repair.util.js';

describe('repairAudienceRoutingModelJson', () => {
  it('fixes trailing comma in targetAgentIds', () => {
    const raw = '{"targetAgentIds":["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",],"confidence":0.9}';
    const fixed = repairAudienceRoutingModelJson(raw);
    expect(JSON.parse(fixed)).toEqual({
      targetAgentIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      confidence: 0.9,
    });
  });

  it('fixes missing comma between quoted UUIDs', () => {
    const raw =
      '{"targetAgentIds":["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],"confidence":0.9}';
    const fixed = repairAudienceRoutingModelJson(raw);
    expect(JSON.parse(fixed).targetAgentIds).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('quotes bare UUIDs in targetAgentIds', () => {
    const raw =
      '{"targetAgentIds":[05448f5b-8464-41ff-9f38-2c0c323005d9,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]}';
    const fixed = repairAudienceRoutingModelJson(raw);
    expect(JSON.parse(fixed).targetAgentIds).toEqual([
      '05448f5b-8464-41ff-9f38-2c0c323005d9',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('normalizes empty targetAgentIds', () => {
    const raw = '{"targetAgentIds":[  ], "confidence":0.9}';
    const fixed = repairAudienceRoutingModelJson(raw);
    expect(JSON.parse(fixed).targetAgentIds).toEqual([]);
  });
});
