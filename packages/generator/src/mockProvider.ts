import type { DocumentationProvider, GenerationResult, GeneratorContext } from '@tracedocs/core';

export interface MockProviderOptions {
  /**
   * `propose` (default) generates a placeholder patch; `needsMoreInfo` and
   * `unavailable` force the corresponding outcome regardless of context —
   * for exercising both non-happy paths deterministically in tests without
   * a real provider ever being unreachable or genuinely unsure.
   */
  behavior?: 'propose' | 'needsMoreInfo' | 'unavailable';
}

/**
 * Deterministic, fully offline provider — never opens a network
 * connection. This is what makes a paid LLM provider optional (brief's
 * non-goals: "a mandatory paid LLM provider"): it's the CLI's default,
 * and it's what every test in this package and `generateDocumentationUpdates`
 * runs against, so none of that needs network access or an API key either.
 */
export function createMockProvider(options: MockProviderOptions = {}): DocumentationProvider {
  const behavior = options.behavior ?? 'propose';

  return {
    name: 'mock',
    async generatePatch(context: GeneratorContext): Promise<GenerationResult> {
      if (behavior === 'unavailable') {
        return { status: 'PROVIDER_UNAVAILABLE', reason: 'Mock provider configured to simulate unavailability.' };
      }

      if (behavior === 'needsMoreInfo' || !context.codeAfter) {
        return {
          status: 'NEEDS_MORE_INFORMATION',
          reason: context.codeAfter
            ? 'Mock provider configured to always request more information.'
            : 'No "after" source snippet was available for this symbol.',
        };
      }

      return {
        status: 'PROPOSED',
        patch: {
          documentPath: context.documentPath,
          sectionHeading: context.sectionHeading,
          originalContent: context.originalSectionContent,
          proposedContent: `${context.originalSectionContent}\n\n> **Note:** \`${context.relatedSymbolName}\` changed and this section may need review. _(mock-generated placeholder, not real prose)_`,
          explanation: `Mock-generated placeholder noting that \`${context.relatedSymbolName}\` changed.`,
          evidence: [context.evidence],
          assumptions: ['This is a placeholder patch from the mock provider, not a real generated edit.'],
        },
      };
    },
  };
}
