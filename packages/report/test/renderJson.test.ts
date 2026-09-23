import { describe, expect, it } from 'vitest';
import { renderJson } from '../src/renderJson.js';
import { sampleReport } from './helpers/sampleReport.js';

describe('renderJson', () => {
  it('round-trips a report through JSON', () => {
    const report = sampleReport();
    const parsed = JSON.parse(renderJson(report));
    expect(parsed).toEqual(report);
  });

  it('produces readable, indented JSON', () => {
    const output = renderJson(sampleReport());
    expect(output).toContain('\n  "repositoryRoot"');
  });
});
