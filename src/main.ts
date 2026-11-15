import { register } from 'tsconfig-paths';
const path = require('path');

// Register tsconfig-paths for runtime alias resolution (@/ -> dist/)
// In production, compiled files are in dist/ directly (not dist/src/)
register({
  baseUrl: path.join(__dirname),
  paths: {
    '@/*': ['*'],
  },
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // CORS
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Distributed Wagering Processor API')
    .setDescription('Jungle Gaming Backend Challenge - Distributed Wagering Processor')
    .setVersion('1.0')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'Idempotency-Key',
      in: 'header',
      description: 'Idempotency key for deduplication',
      required: false,
      schema: { type: 'string' },
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get('PORT', 3000);
  await app.listen(port);

  console.log(`🚀 Application running on http://localhost:${port}`);
  console.log(`📚 Swagger docs available at http://localhost:${port}/docs`);
}

bootstrap();