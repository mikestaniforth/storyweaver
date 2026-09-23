import { ART_GENERATIONS_PER_CHAPTER, type CampaignState } from '@family-adventure/shared';
import { Storage } from '@google-cloud/storage';
import type { AppConfig } from '../config.js';
import { googleJsonRequest } from './google-access.js';

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
}

interface SpeechResponse {
  audioContent?: string;
}

export class MediaService {
  private readonly storage: Storage | null;

  constructor(private readonly config: AppConfig) {
    this.storage = config.mediaBucket
      ? new Storage(config.googleCloudProject ? { projectId: config.googleCloudProject } : {})
      : null;
  }

  get enabled(): boolean {
    return Boolean(this.config.googleCloudProject && this.config.mediaBucket);
  }

  async generateSceneArt(campaign: CampaignState): Promise<string | null> {
    if (!this.enabled || !campaign.currentUi.artPrompt) return null;
    if (campaign.artGenerationsThisChapter >= ART_GENERATIONS_PER_CHAPTER) return null;
    const project = this.config.googleCloudProject as string;
    const location = this.config.vertexLocation;
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${this.config.imageModel}:generateContent`;
    const prompt = `Generate exactly one wide establishing image for a private family fantasy game. ${campaign.currentUi.artPrompt}

Art direction: authentic 16-bit pixel art, deliberate blocky pixels, limited harmonious colour palette, layered cinematic depth, atmospheric lighting, adventurous supernatural mystery, no text, no logo, no interface, no photorealism, no sexual content, no gore. Keep the scene readable behind white overlay text.`;
    const result = await googleJsonRequest<GeminiImageResponse>(
      url,
      {
        contents: {
          role: 'USER',
          parts: [{ text: prompt }],
        },
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '16:9' },
        },
        safetySettings: [
          {
            method: 'PROBABILITY',
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            method: 'PROBABILITY',
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_LOW_AND_ABOVE',
          },
        ],
      },
      180_000,
    );
    const image = result.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData;
    if (!image?.data) return null;
    const path = `campaigns/${campaign.id}/chapter-${campaign.chapterNumber}/scene-${campaign.version}.png`;
    const file = (this.storage as Storage).bucket(this.config.mediaBucket as string).file(path);
    await file.save(Buffer.from(image.data, 'base64'), {
      contentType: image.mimeType ?? 'image/png',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=604800' },
    });
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60_000,
    });
    return signedUrl;
  }

  async synthesizeSpeech(text: string, turnId: string): Promise<Buffer | null> {
    if (!this.config.googleCloudProject) return null;
    const cachedFile =
      this.storage && this.config.mediaBucket
        ? this.storage.bucket(this.config.mediaBucket).file(`turn-audio/${turnId}.mp3`)
        : null;
    if (cachedFile) {
      const [exists] = await cachedFile.exists();
      if (exists) {
        const [cached] = await cachedFile.download();
        return cached;
      }
    }
    const result = await googleJsonRequest<SpeechResponse>(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      {
        input: { text },
        voice: { languageCode: 'en-GB', name: 'en-GB-Neural2-D' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.94, pitch: -1 },
      },
      20_000,
    );
    if (!result.audioContent) return null;
    const audio = Buffer.from(result.audioContent, 'base64');
    if (cachedFile) {
      await cachedFile.save(audio, {
        contentType: 'audio/mpeg',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=604800' },
      });
    }
    return audio;
  }

  async purgeCampaignAssets(campaignId: string, turnIds: string[]): Promise<void> {
    if (!this.storage || !this.config.mediaBucket) return;
    const bucket = this.storage.bucket(this.config.mediaBucket);
    await bucket.deleteFiles({ prefix: `campaigns/${campaignId}/`, force: true });
    await Promise.all(
      turnIds.map(async (turnId) => {
        await bucket.file(`turn-audio/${turnId}.mp3`).delete({ ignoreNotFound: true });
      }),
    );
  }
}
