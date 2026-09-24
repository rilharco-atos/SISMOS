import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JsonLogger } from './modules/observability/json-logger';

async function bootstrap() {
  const json = process.env.LOG_FORMAT === 'json' || (process.env.NODE_ENV === 'production' && process.env.LOG_FORMAT !== 'pretty');
  const app = await NestFactory.create(AppModule, json ? { logger: new JsonLogger() } : { bufferLogs: false });

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.UI_URL || 'http://localhost:3000',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('IPMA Sismos API')
    .setDescription('API da plataforma de Comunicados Sismológicos do IPMA')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(JSON.stringify({ msg: 'API iniciada', port, ambiente: process.env.APP_ENV ?? 'development', logFormat: json ? 'json' : 'pretty' }));
}

bootstrap();
