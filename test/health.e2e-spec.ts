import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health Checks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health/live', () => {
    it('deve retornar status ok para liveness probe', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/live')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.liveness).toBeDefined();
      expect(response.body.checks.liveness.status).toBe('up');
    });
  });

  describe('GET /health/ready', () => {
    it('deve retornar status ok para readiness probe quando dependências saudáveis', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.database).toBeDefined();
      expect(response.body.checks.database.status).toBe('up');
      expect(response.body.checks.sqs).toBeDefined();
    });
  });
});