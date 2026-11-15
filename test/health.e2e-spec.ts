import * as request from 'supertest';
import { app } from './setup-e2e';

describe('Health Checks (e2e)', () => {

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