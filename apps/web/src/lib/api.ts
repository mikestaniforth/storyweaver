import type {
  CampaignView,
  ChapterFeedback,
  ContentSettings,
  CreateCampaignInput,
  PlayerProfile,
} from '@family-adventure/shared';
import { currentAppCheckToken } from './firebase';

export interface FamilySummary {
  id: string;
  familyCode: string;
  childProfileId: string | null;
  childProfileIds: string[];
}

export interface BootstrapData {
  family: FamilySummary;
  profiles: PlayerProfile[];
}

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ApiClient {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? '';

  constructor(private readonly getToken: () => Promise<string | null>) {}

  bootstrap(): Promise<BootstrapData> {
    return this.request('/api/bootstrap', { method: 'POST' });
  }

  createChildProfile(input: {
    displayName: string;
    avatar: string;
    archetype: PlayerProfile['archetype'];
    pin?: string;
  }): Promise<BootstrapData> {
    return this.request('/api/families/child-profile', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  rotateFamilyCode(): Promise<BootstrapData> {
    return this.request('/api/families/rotate-code', { method: 'POST' });
  }

  async listCampaigns(): Promise<CampaignView[]> {
    const result = await this.request<{ campaigns: CampaignView[] }>('/api/campaigns');
    return result.campaigns;
  }

  async getCampaign(id: string): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}`);
    return result.campaign;
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return result.campaign;
  }

  async updateContentSettings(id: string, settings: ContentSettings): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return result.campaign;
  }

  async presence(id: string, sessionId: string): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/presence`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    return result.campaign;
  }

  async start(id: string): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/start`, {
      method: 'POST',
    });
    return result.campaign;
  }

  async act(
    id: string,
    action: string,
    idempotencyKey: string,
    useSpecialMove = false,
  ): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, idempotencyKey, useSpecialMove }),
    });
    return result.campaign;
  }

  async rewind(id: string): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/rewind`, {
      method: 'POST',
    });
    return result.campaign;
  }

  async generateArt(id: string): Promise<CampaignView> {
    const result = await this.request<{ campaign: CampaignView }>(`/api/campaigns/${id}/art`, {
      method: 'POST',
    });
    return result.campaign;
  }

  feedback(id: string, rating: ChapterFeedback['rating']): Promise<void> {
    return this.request(`/api/campaigns/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  deleteCampaign(id: string): Promise<void> {
    return this.request(`/api/campaigns/${id}`, { method: 'DELETE' });
  }

  async exportCampaign(id: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/campaigns/${id}/export`, {
      headers: await this.headers(),
    });
    if (!response.ok) await this.throwResponse(response);
    return response.blob();
  }

  async audio(turnId: string): Promise<Blob | null> {
    const headers = await this.headers();
    const response = await fetch(`${this.baseUrl}/api/turns/${turnId}/audio`, {
      method: 'POST',
      headers,
    });
    if (response.status === 204) return null;
    if (!response.ok) await this.throwResponse(response);
    return response.blob();
  }

  private async headers(): Promise<HeadersInit> {
    const token = await this.getToken();
    const appCheck = await currentAppCheckToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(await this.headers()), ...init.headers },
    });
    if (!response.ok) await this.throwResponse(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async throwResponse(response: Response): Promise<never> {
    let body: { error?: { code?: string; message?: string } } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // The status remains useful when a proxy returns a non-JSON error.
    }
    throw new ClientApiError(
      response.status,
      body.error?.code ?? 'request_failed',
      body.error?.message ?? 'The adventure could not reach the server.',
    );
  }
}
