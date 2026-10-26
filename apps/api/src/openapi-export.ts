import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildOpenApi, createApp } from './bootstrap';

/** Writes docs/api/openapi.json without starting the HTTP server. */
async function main() {
  const app = await createApp({ logger: false });
  await app.init();
  const out = path.resolve(__dirname, '../../../docs/api/openapi.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2));
  await app.close();
  console.log(`OpenAPI written to ${out}`);
}

main();
