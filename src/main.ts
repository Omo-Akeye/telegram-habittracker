import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-telegram-id', 'x-api-key'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HabitBot')
      .setDescription('Telegram Habit Tracker API')
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' })
      .addTag('habits')
      .addTag('completions')
      .addTag('users')
      .addTag('statistics')
      .addTag('telegram')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
