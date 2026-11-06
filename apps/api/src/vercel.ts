import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configurarApp, criarLogger } from './app.factory';

let servidor: Promise<express.Express> | null = null;

/*********************************************************************************************************************
* @method       criarServidor
* @description  Creates and initialises the NestJS application wrapped in a plain Express adapter
*               for use in a Vercel serverless environment. Called once per serverless instance;
*               the result is cached in the module-level servidor variable and reused across
*               requests (Vercel Fluid Compute).
* @return       Promise resolving to the configured Express application
* @uses         NestFactory.create, ExpressAdapter, configurarApp, criarLogger
*********************************************************************************************************************/
async function criarServidor(): Promise<express.Express> {
  const app = express();
  const logger = criarLogger();
  const nest = await NestFactory.create(AppModule, new ExpressAdapter(app), { ...(logger ? { logger } : {}), bodyParser: false });
  configurarApp(nest);
  await nest.init();
  return app;
}

/*********************************************************************************************************************
* @method       handler
* @description  Default export for the Vercel serverless function. Initialises the NestJS application
*               on the first invocation and forwards all subsequent requests to the cached Express
*               instance. Resets the cached promise on initialisation failure so the next request
*               can retry.
* @param        req — Node.js IncomingMessage from the Vercel runtime
* @param        res — Node.js ServerResponse from the Vercel runtime
* @return       Promise resolving when the request has been handed off to the Express app
* @uses         criarServidor
*********************************************************************************************************************/
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!servidor) {
    servidor = criarServidor().catch(e => {
      servidor = null;
      throw e;
    });
  }
  const app = await servidor;
  app(req as any, res as any);
}
