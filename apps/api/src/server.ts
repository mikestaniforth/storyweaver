import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { LocalNarrativeProvider } from './providers/local-narrative-provider.js';
import type { NarrativeProvider } from './providers/narrative-provider.js';
import { VertexNarrativeProvider } from './providers/vertex-narrative-provider.js';
import { FirestoreGameRepository } from './repositories/firestore-repository.js';
import type { GameRepository } from './repositories/game-repository.js';
import { InMemoryGameRepository } from './repositories/in-memory-repository.js';
import { ChildAuthService } from './services/child-auth-service.js';
import { ArtQueueService } from './services/art-queue-service.js';
import { GameService } from './services/game-service.js';
import { MediaService } from './services/media-service.js';
import { MemoryService } from './services/memory-service.js';
import { ModelArmorService } from './services/model-armor.js';

const config = loadConfig();
const repository: GameRepository = config.localDemoMode
  ? new InMemoryGameRepository(true)
  : new FirestoreGameRepository(config.googleCloudProject ?? undefined);
const narrative: NarrativeProvider =
  config.narrativeProvider === 'vertex'
    ? new VertexNarrativeProvider(config)
    : new LocalNarrativeProvider();
const armor = new ModelArmorService(config);
const memory = new MemoryService(config, repository);
const media = new MediaService(config);
const game = new GameService(repository, narrative, armor, memory, media);
const childAuth = new ChildAuthService(config, repository);
const artQueue = new ArtQueueService(config);
const app = createApp({ config, repository, game, childAuth, artQueue });

app.listen(config.port, config.localDemoMode ? '127.0.0.1' : '0.0.0.0', () => {
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'server_started',
      port: config.port,
      mode: config.localDemoMode ? 'local-demo' : 'production',
      narrativeProvider: narrative.name,
      region: config.googleCloudLocation,
      vertexRegion: config.vertexLocation,
    }),
  );
});
