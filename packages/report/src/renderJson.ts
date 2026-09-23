import type { Report } from '@tracedocs/core';

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
