import type { MemoryWrite } from '@family-adventure/shared';
import { nanoid } from 'nanoid';
import type { AppConfig } from '../config.js';
import type { GameRepository, StoredMemory } from '../repositories/game-repository.js';
import { googleJsonRequest } from './google-access.js';

interface EmbeddingResponse {
  predictions?: Array<{ embeddings?: { values?: number[] }; values?: number[] }>;
}

export class MemoryService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: GameRepository,
  ) {}

  async retrieve(campaignId: string, query: string): Promise<MemoryWrite[]> {
    const [recent, campaign, queryVector] = await Promise.all([
      this.repository.getMemories(campaignId, 12),
      this.repository.getCampaign(campaignId),
      this.embedOne(query, 'RETRIEVAL_QUERY'),
    ]);
    let similar: StoredMemory[] = [];
    if (queryVector) {
      try {
        similar = await this.repository.getSimilarMemories(campaignId, queryVector, 8);
      } catch (error) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'vector_retrieval_failed',
            message: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
    }
    const patterns = campaign ? await this.repository.getFamilyPatterns(campaign.familyId, 4) : [];
    const ordered = [...similar, ...recent, ...patterns];
    const unique = [...new Map(ordered.map((memory) => [memory.id, memory])).values()];
    return unique
      .sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map(({ kind, text, importance }) => ({ kind, text, importance }));
  }

  async prepare(params: {
    campaignId: string;
    familyId: string;
    chapterNumber: number;
    turnId: string;
    writes: MemoryWrite[];
  }): Promise<StoredMemory[]> {
    const embeddings = await this.embed(
      params.writes.map((write) => write.text),
      'RETRIEVAL_DOCUMENT',
    );
    const now = new Date().toISOString();
    return params.writes.map((write, index) => ({
      id: `memory-${nanoid(12)}`,
      campaignId: params.campaignId,
      familyId: params.familyId,
      chapterNumber: params.chapterNumber,
      turnId: params.turnId,
      createdAt: now,
      ...write,
      embedding: embeddings[index] ?? null,
    }));
  }

  private async embedOne(text: string, taskType: 'RETRIEVAL_QUERY'): Promise<number[] | null> {
    const [embedding] = await this.embed([text], taskType);
    return embedding ?? null;
  }

  private async embed(
    texts: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  ): Promise<Array<number[] | null>> {
    if (
      texts.length === 0 ||
      !this.config.googleCloudProject ||
      this.config.narrativeProvider === 'local'
    ) {
      return texts.map(() => null);
    }
    try {
      const location = this.config.vertexLocation;
      const project = this.config.googleCloudProject;
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${this.config.embeddingModel}:predict`;
      const result = await googleJsonRequest<EmbeddingResponse>(
        url,
        {
          instances: texts.map((content) => ({ content, task_type: taskType })),
        },
        5_000,
      );
      return texts.map((_, index) => {
        const prediction = result.predictions?.[index];
        return prediction?.embeddings?.values ?? prediction?.values ?? null;
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'embedding_failed',
          message: error instanceof Error ? error.message : 'unknown',
        }),
      );
      return texts.map(() => null);
    }
  }
}
