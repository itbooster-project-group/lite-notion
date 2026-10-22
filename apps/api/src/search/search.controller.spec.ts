import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayIdentityGuard } from '../auth/guards/gateway-identity.guard';
import {
  INTERNAL_IDENTITY_SESSION_HEADER,
  INTERNAL_IDENTITY_USER_HEADER,
} from '../internal/constants';
import { SearchController } from './search.controller';
import { SearchReadService } from './search-read.service';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = '550e8400-e29b-41d4-a716-446655440001';
const pageId = '550e8400-e29b-41d4-a716-446655440002';

describe('SearchController HTTP contract', () => {
  let app: INestApplication;
  const searchPages = vi.fn();

  beforeEach(async () => {
    searchPages.mockReset();
    searchPages.mockImplementation(async (_userId: string, query: string) =>
      query.length === 0 ? [] : [{ pageId, title: 'Search title', snippet: null }],
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchReadService, useValue: { searchPages } },
        { provide: APP_GUARD, useClass: GatewayIdentityGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires an authenticated request', async () => {
    await request(app.getHttpServer()).get('/api/v1/search?query=term').expect(401);
  });

  it('trims query, defaults limit, and returns only the documented response fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search?query=%20%20important%20%20')
      .set(INTERNAL_IDENTITY_USER_HEADER, userId)
      .set(INTERNAL_IDENTITY_SESSION_HEADER, sessionId)
      .expect(200);

    expect(searchPages).toHaveBeenCalledWith(userId, 'important', 20);
    expect(response.body).toEqual([{ pageId, title: 'Search title', snippet: null }]);
  });

  it('returns an empty array for a blank trimmed query', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/search?query=%20%20')
      .set(INTERNAL_IDENTITY_USER_HEADER, userId)
      .set(INTERNAL_IDENTITY_SESSION_HEADER, sessionId)
      .expect(200);

    expect(response.body).toEqual([]);
    expect(searchPages).toHaveBeenCalledWith(userId, '', 20);
  });

  it('rejects overlong queries and limits outside the documented integer range', async () => {
    const auth = () =>
      request(app.getHttpServer())
        .get('/api/v1/search')
        .set(INTERNAL_IDENTITY_USER_HEADER, userId)
        .set(INTERNAL_IDENTITY_SESSION_HEADER, sessionId);

    await auth()
      .query({ query: 'a'.repeat(201) })
      .expect(400);
    await auth().query({ limit: 0, query: 'term' }).expect(400);
    await auth().query({ limit: 51, query: 'term' }).expect(400);
    await auth().query({ limit: '1.5', query: 'term' }).expect(400);
    await auth().query({ limit: 'invalid', query: 'term' }).expect(400);
  });

  it('accepts both inclusive limit boundaries', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search?query=term&limit=1')
      .set(INTERNAL_IDENTITY_USER_HEADER, userId)
      .set(INTERNAL_IDENTITY_SESSION_HEADER, sessionId)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/search?query=term&limit=50')
      .set(INTERNAL_IDENTITY_USER_HEADER, userId)
      .set(INTERNAL_IDENTITY_SESSION_HEADER, sessionId)
      .expect(200);
  });
});
