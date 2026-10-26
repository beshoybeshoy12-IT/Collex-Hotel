import 'reflect-metadata';
import { SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from './config';
import { buildOpenApi, createApp } from './bootstrap';

async function main() {
  const config = loadConfig();
  const app = await createApp();
  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApi(app));
  }
  await app.listen(config.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`Collex API listening on :${config.API_PORT} (docs: /docs)`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
