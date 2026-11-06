import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { JsonLogger } from './modules/observability/json-logger';

/*********************************************************************************************************************
* @method       usarLogJson
* @description  Returns true when the application should use structured JSON logging.
*               JSON format is active when LOG_FORMAT=json is set explicitly, or when running in
*               production (NODE_ENV=production) or on Vercel (VERCEL env var present).
*               Can be overridden to false with LOG_FORMAT=pretty for local development readability.
* @return       boolean — true for JSON format, false for the default NestJS pretty format
*********************************************************************************************************************/
export function usarLogJson(): boolean {
  if (process.env.LOG_FORMAT === 'json') return true;
  if (process.env.LOG_FORMAT === 'pretty') return false;
  return process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
}

/*********************************************************************************************************************
* @method       criarLogger
* @description  Returns a JsonLogger instance when JSON logging is active, or undefined to let
*               NestJS use its default pretty-print logger.
* @return       JsonLogger instance or undefined
* @uses         usarLogJson, JsonLogger
*********************************************************************************************************************/
export function criarLogger() {
  return usarLogJson() ? new JsonLogger() : undefined;
}

/*********************************************************************************************************************
* @method       configurarApp
* @description  Applies the common NestJS application configuration shared between the standalone
*               server (main.ts) and the Vercel serverless function (vercel.ts). Sets the global
*               API prefix, registers the XML body parser, configures validation, CORS and Swagger.
* @param        app — NestJS application instance to configure
* @return       void
* @uses         ValidationPipe, DocumentBuilder, SwaggerModule, express.text
*********************************************************************************************************************/
export function configurarApp(app: INestApplication): void {
  // Raw body para a rota de ingestão — corre antes do JSON parser para aceitar qualquer Content-Type
  app.use('/api/ingest/xml', express.raw({ type: '*/*', limit: '256kb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '256kb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const origens = (process.env.UI_URL ?? 'http://localhost:3000').split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({ origin: origens, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('IPMA Sismos API')
    .setDescription('API da plataforma de Comunicados Sismológicos do IPMA')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
