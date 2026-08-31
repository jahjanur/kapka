import { createServer, type Server } from 'node:http';
import type { Express } from 'express';

/**
 * One listening server per app, reused for every request against it.
 *
 * supertest starts and stops an ephemeral server for each individual request.
 * That is fine for a handful and not fine for the hundreds this suite makes:
 * under load the churn produces intermittent "socket hang up" failures that
 * have nothing to do with the code being tested, and they land on whichever
 * test happened to be running.
 */
const servers = new Map<Express, Server>();

export function serverFor(app: Express): Server {
  let server = servers.get(app);
  if (!server) {
    server = createServer(app).listen(0);
    // The process should not be held open by a test server.
    server.unref();
    servers.set(app, server);
  }
  return server;
}

// No explicit close: the servers are unref'd, so they never hold the process
// open and go away with it. An afterAll that closed them would only be one
// more thing able to fail a run in which every test passed.
