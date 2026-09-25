import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JsonLogger } from './modules/observability/json-logger';

/** Logs JSON em produção/serverless (ou com LOG_FORMAT=json); formato legível em desenvolvimento. */
export function usarLogJson(): boolean {
  if (process.env.LOG_FORMAT === 'json') return true;
  if (process.env.LOG_FORMAT === 'pretty') return false;
  return process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
}

export function criarLogger() {
  return usarLogJson() ? new JsonLogger() : undefined;
}

/** Configuração comum ao servidor (main.ts) e à função serverless (vercel.ts). */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // UI_URL pode ter várias origens separadas por vírgula; na Vercel a UI chama a API pelo mesmo domínio (rewrite).
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
