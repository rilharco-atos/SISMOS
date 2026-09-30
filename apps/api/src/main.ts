import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configurarApp, criarLogger, usarLogJson } from './app.factory';

const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Variável de ambiente obrigatória em falta: ${key}`);
    process.exit(1);
  }
}

/** Arranque como servidor permanente (desenvolvimento, Docker, servidores do IPMA). */
async function bootstrap() {
  const logger = criarLogger();
  const app = await NestFactory.create(AppModule, logger ? { logger } : {});
  configurarApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(JSON.stringify({ msg: 'API iniciada', port, ambiente: process.env.APP_ENV ?? 'development', logFormat: usarLogJson() ? 'json' : 'pretty' }));
}

bootstrap();
