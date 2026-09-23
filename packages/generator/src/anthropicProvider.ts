import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { DocumentationProvider, GenerationResult, GeneratorContext } from '@tracedocs/core';

const DEFAULT_MODEL = 'claude-opus-5';

const PatchResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('PROPOSED'),
    proposedContent: z.string().describe('The full replacement text for the section, in Markdown.'),
    explanation: z
      .string()
      .describe('One or two sentences: what changed in the code and why this section needed updating.'),
    evidence: z
      .array(z.string())
      .describe('Specific facts drawn from the provided "after" code that support this change.'),
    assumptions: z
      .array(z.string())
      .describe('Anything inferred rather than directly confirmed by the provided code.'),
  }),
  z.object({
    status: z.literal('NEEDS_MORE_INFORMATION'),
    reason: z.string().describe('Specifically what information would be needed to safely propose an update.'),
  }),
]);

const SYSTEM_PROMPT = `You update one section of technical documentation to reflect a code change.

Rules:
- Only describe behavior directly visible in the provided "after" code. Never invent parameters, return values, error conditions, or behavior that isn't shown there.
- This is a targeted edit, not a rewrite — keep the original section's tone, structure, and level of detail wherever that's still accurate.
- If the provided code and evidence aren't enough to confidently describe what changed, respond with status NEEDS_MORE_INFORMATION and say specifically what's missing. Do not guess.
- Respond only through the structured output schema — no prose outside it.`;

export interface AnthropicProviderOptions {
  /** Defaults to the SDK's normal credential resolution (env var, `ant auth login`, ...) when omitted. */
  apiKey?: string;
  /** Defaults to `TRACEDOCS_ANTHROPIC_MODEL` env var, then `claude-opus-5`. */
  model?: string;
}

function buildPrompt(context: GeneratorContext): string {
  return [
    `Document: ${context.documentPath}`,
    context.sectionHeading ? `Section: ${context.sectionHeading}` : 'Section: (whole page — no specific heading)',
    '',
    'Current documentation text for this section:',
    '```markdown',
    context.originalSectionContent,
    '```',
    '',
    `Code symbol: \`${context.relatedSymbolName}\` (${context.relatedSymbolKind})`,
    context.codeBefore ? `Before:\n\`\`\`\n${context.codeBefore}\n\`\`\`` : 'Before: (not available)',
    context.codeAfter ? `After:\n\`\`\`\n${context.codeAfter}\n\`\`\`` : 'After: (not available)',
    '',
    `Why this section may be affected: ${context.explanation}`,
    `Evidence: ${context.evidence}`,
  ].join('\n');
}

/** Maps a caught error to a short, actionable reason string — never a raw stack trace. */
export function describeProviderError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'Authentication failed — check the API key.';
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited by the provider — try again later.';
  if (error instanceof Anthropic.APIConnectionError) return 'Could not connect to the provider.';
  if (error instanceof Anthropic.APIError) return `Provider returned an error: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Anthropic adapter — the one concrete provider implementation this
 * milestone ships (brief: "one configurable provider adapter"). Nothing
 * outside this file imports `@anthropic-ai/sdk`; swapping or adding a
 * vendor means writing another module against the same
 * `DocumentationProvider` interface, not touching callers.
 *
 * Never throws: if the client can't be constructed (e.g. no credentials
 * configured anywhere the SDK looks), that's captured once here and every
 * `generatePatch` call returns `PROVIDER_UNAVAILABLE` with the reason,
 * instead of the factory itself throwing at a point the CLI would have to
 * separately handle.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): DocumentationProvider {
  const model = options.model ?? process.env.TRACEDOCS_ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  let client: Anthropic | null = null;
  let initErrorReason: string | null = null;
  try {
    client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
  } catch (error) {
    initErrorReason = describeProviderError(error);
  }

  return {
    name: 'anthropic',
    async generatePatch(context: GeneratorContext): Promise<GenerationResult> {
      if (!client) {
        return { status: 'PROVIDER_UNAVAILABLE', reason: initErrorReason ?? 'Anthropic client could not be initialized.' };
      }

      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPrompt(context) }],
          output_config: { format: zodOutputFormat(PatchResponseSchema) },
        });

        const parsed = response.parsed_output;
        if (!parsed) {
          return {
            status: 'PROVIDER_UNAVAILABLE',
            reason: 'The provider response could not be parsed into the expected structure.',
          };
        }

        if (parsed.status === 'NEEDS_MORE_INFORMATION') {
          return { status: 'NEEDS_MORE_INFORMATION', reason: parsed.reason };
        }

        return {
          status: 'PROPOSED',
          patch: {
            documentPath: context.documentPath,
            sectionHeading: context.sectionHeading,
            originalContent: context.originalSectionContent,
            proposedContent: parsed.proposedContent,
            explanation: parsed.explanation,
            evidence: parsed.evidence,
            assumptions: parsed.assumptions,
          },
        };
      } catch (error) {
        return { status: 'PROVIDER_UNAVAILABLE', reason: describeProviderError(error) };
      }
    },
  };
}
