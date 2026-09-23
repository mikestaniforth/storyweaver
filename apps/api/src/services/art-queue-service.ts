import { CloudTasksClient } from '@google-cloud/tasks';
import { OAuth2Client } from 'google-auth-library';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import { ApiError } from '../errors.js';

export class ArtQueueService {
  private readonly client: CloudTasksClient | null;

  constructor(private readonly config: AppConfig) {
    this.client = this.enabled ? new CloudTasksClient() : null;
  }

  get enabled(): boolean {
    return Boolean(
      !this.config.localDemoMode &&
      this.config.googleCloudProject &&
      this.config.tasksQueue &&
      this.config.serviceUrl &&
      this.config.taskServiceAccount,
    );
  }

  async enqueue(campaignId: string, expectedVersion: number): Promise<void> {
    if (
      !this.client ||
      !this.config.googleCloudProject ||
      !this.config.tasksQueue ||
      !this.config.serviceUrl ||
      !this.config.taskServiceAccount
    ) {
      return;
    }
    const parent = this.client.queuePath(
      this.config.googleCloudProject,
      this.config.googleCloudLocation,
      this.config.tasksQueue,
    );
    const taskId = `scene-art-${campaignId}-${expectedVersion}`.replace(/[^A-Za-z0-9_-]/g, '-');
    try {
      await this.client.createTask({
        parent,
        task: {
          name: this.client.taskPath(
            this.config.googleCloudProject,
            this.config.googleCloudLocation,
            this.config.tasksQueue,
            taskId.slice(0, 500),
          ),
          httpRequest: {
            httpMethod: 'POST',
            url: `${this.config.serviceUrl}/internal/tasks/scene-art`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ campaignId })).toString('base64'),
            oidcToken: {
              serviceAccountEmail: this.config.taskServiceAccount,
              audience: this.config.serviceUrl,
            },
          },
          dispatchDeadline: { seconds: 300 },
        },
      });
    } catch (error) {
      const code = (error as { code?: number | string }).code;
      if (code === 6 || code === 'already-exists') return;
      throw error;
    }
  }
}

export function requireTaskIdentity(config: AppConfig): RequestHandler {
  const verifier = new OAuth2Client();
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (config.localDemoMode) {
        next();
        return;
      }
      if (!config.serviceUrl || !config.taskServiceAccount)
        throw new Error('task identity is not configured');
      const authorization = req.header('authorization');
      const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
      if (!token) throw new Error('missing task token');
      const ticket = await verifier.verifyIdToken({ idToken: token, audience: config.serviceUrl });
      const payload = ticket.getPayload();
      if (payload?.email !== config.taskServiceAccount || payload.email_verified !== true) {
        throw new Error('unexpected task identity');
      }
      next();
    } catch {
      next(new ApiError(401, 'invalid_task', 'The background task could not be verified.'));
    }
  };
}
