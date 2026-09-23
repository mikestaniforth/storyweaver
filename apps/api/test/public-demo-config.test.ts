import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
describe('public demo configuration', () => {
  it('ignores ambient cloud resources in local mode', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      GOOGLE_CLOUD_PROJECT: 'unwanted-live-project',
      NARRATIVE_PROVIDER: 'vertex',
      MEDIA_BUCKET: 'live-media',
      MODEL_ARMOR_TEMPLATE: 'live-template',
      TASKS_QUEUE: 'live-queue',
    });
    expect(config.localDemoMode).toBe(true);
    expect(config.narrativeProvider).toBe('local');
    expect(config.googleCloudProject).toBeNull();
    expect(config.mediaBucket).toBeNull();
    expect(config.modelArmorTemplate).toBeNull();
    expect(config.tasksQueue).toBeNull();
  });
});
