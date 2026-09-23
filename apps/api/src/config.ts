import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  port: z.number().int().positive(),
  localDemoMode: z.boolean(),
  allowedOrigins: z.array(z.string()).min(1),
  googleCloudProject: z.string().nullable(),
  googleCloudLocation: z.string(),
  vertexLocation: z.string(),
  narrativeProvider: z.enum(['local', 'vertex']),
  narrativeModel: z.string(),
  planningModel: z.string(),
  embeddingModel: z.string(),
  imageModel: z.string(),
  modelArmorTemplate: z.string().nullable(),
  modelArmorLocation: z.string(),
  mediaBucket: z.string().nullable(),
  requireAppCheck: z.boolean(),
  logRetentionDays: z.number().int().positive(),
  tasksQueue: z.string().nullable(),
  serviceUrl: z.string().url().nullable(),
  taskServiceAccount: z.string().email().nullable(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env = process.env): AppConfig {
  const ambientProject = env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT ?? null;
  const production = env.NODE_ENV === 'production';
  const requestedDemo = booleanFromString.safeParse(
    env.LOCAL_DEMO_MODE ?? (!production).toString(),
  );
  const requestedAppCheck = booleanFromString.safeParse(
    env.REQUIRE_APP_CHECK ?? production.toString(),
  );

  const localDemoMode = requestedDemo.success ? requestedDemo.data : !production;
  const project = localDemoMode ? null : ambientProject;

  return ConfigSchema.parse({
    nodeEnv: env.NODE_ENV ?? 'development',
    port: Number(env.PORT ?? 8787),
    localDemoMode,
    allowedOrigins: (env.ALLOWED_ORIGIN ?? 'http://localhost:5173')
      .split('|')
      .map((origin) => origin.trim())
      .filter(Boolean),
    googleCloudProject: project,
    googleCloudLocation: env.GOOGLE_CLOUD_LOCATION ?? 'europe-west2',
    vertexLocation: env.VERTEX_LOCATION ?? 'europe-west4',
    narrativeProvider: localDemoMode ? 'local' : (env.NARRATIVE_PROVIDER ?? 'local'),
    narrativeModel: env.NARRATIVE_MODEL ?? 'gemini-2.5-flash',
    planningModel: env.PLANNING_MODEL ?? 'gemini-2.5-pro',
    embeddingModel: env.EMBEDDING_MODEL ?? 'text-embedding-004',
    imageModel: env.IMAGE_MODEL ?? 'gemini-2.5-flash-image',
    modelArmorTemplate: localDemoMode ? null : (env.MODEL_ARMOR_TEMPLATE ?? null),
    modelArmorLocation: env.MODEL_ARMOR_LOCATION ?? 'europe-west2',
    mediaBucket: localDemoMode ? null : (env.MEDIA_BUCKET ?? null),
    requireAppCheck: requestedAppCheck.success ? requestedAppCheck.data : production,
    logRetentionDays: Number(env.LOG_RETENTION_DAYS ?? 14),
    tasksQueue: localDemoMode ? null : (env.TASKS_QUEUE ?? null),
    serviceUrl: env.CLOUD_RUN_SERVICE_URL ?? null,
    taskServiceAccount: env.TASK_SERVICE_ACCOUNT ?? null,
  });
}
