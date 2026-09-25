import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configurarApp, criarLogger } from './app.factory';

let servidor: Promise<express.Express> | null = null;

/** A aplicação Nest é criada uma vez por instância e reutilizada entre pedidos (Fluid Compute). */
async function criarServidor(): Promise<express.Express> {
  const app = express();
  const logger = criarLogger();
  const nest = await NestFactory.create(AppModule, new ExpressAdapter(app), logger ? { logger } : {});
  configurarApp(nest);
  await nest.init();
  return app;
}

/** Handler da função serverless (Vercel): todos os pedidos são reencaminhados para aqui. */
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
