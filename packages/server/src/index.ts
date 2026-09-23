import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { GraphStore } from '@tracedocs/graph';
import { buildServer } from './app.js';

const dbPath = resolve(process.env.TRACEDOCS_DB ?? '.tracedocs/server.db');
const port = Number(process.env.PORT ?? 4000);

await mkdir(dirname(dbPath), { recursive: true });
const store = GraphStore.open(dbPath);
const app = await buildServer(store);

app.listen({ port, host: '127.0.0.1' }, (error, address) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
  console.log(`TraceDocs server listening at ${address} (db: ${dbPath})`);
});
