import type { AppConfig } from '../config.js';
import { ApiError } from '../errors.js';
import { googleJsonRequest } from './google-access.js';

interface ArmorResponse {
  sanitizationResult?: {
    filterMatchState?: string;
  };
  filterMatchState?: string;
  [key: string]: unknown;
}

export type ArmorVerdict = 'allow' | 'block' | 'indeterminate';

export function classifyArmorResult(result: ArmorResponse): ArmorVerdict {
  const matchState = result.sanitizationResult?.filterMatchState ?? result.filterMatchState;
  if (matchState === 'NO_MATCH_FOUND') return 'allow';
  if (matchState === 'MATCH_FOUND' || matchState === 'BLOCKED') return 'block';
  return 'indeterminate';
}

export class ModelArmorService {
  constructor(private readonly config: AppConfig) {}

  async screenPrompt(text: string): Promise<void> {
    await this.screen('sanitizeUserPrompt', { userPromptData: { text } });
  }

  async screenResponse(text: string): Promise<void> {
    await this.screen('sanitizeModelResponse', { modelResponseData: { text } });
  }

  private async screen(method: string, body: unknown): Promise<void> {
    if (!this.config.modelArmorTemplate || !this.config.googleCloudProject) return;
    const template = this.config.modelArmorTemplate.startsWith('projects/')
      ? this.config.modelArmorTemplate
      : `projects/${this.config.googleCloudProject}/locations/${this.config.modelArmorLocation}/templates/${this.config.modelArmorTemplate}`;
    const url = `https://modelarmor.${this.config.modelArmorLocation}.rep.googleapis.com/v1/${template}:${method}`;
    const result = await googleJsonRequest<ArmorResponse>(url, body, 4_000);
    const verdict = classifyArmorResult(result);
    if (verdict === 'block') {
      throw new ApiError(
        422,
        'content_not_safe',
        'The Storyweaver cannot use that wording. Please rephrase it without sexual content or extreme language.',
      );
    }
    if (verdict === 'indeterminate') {
      throw new Error('Model Armor returned an indeterminate sanitization verdict.');
    }
  }
}
