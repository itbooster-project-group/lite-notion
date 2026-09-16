import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { ApplicationConfig } from '../../config/application-config';
import { INTERNAL_SERVICE_TOKEN_HEADER } from '../constants';
import { InternalServiceGuard } from './internal-service.guard';

const serviceToken = 'internal-service-token-value-32-chars';

function contextWithHeaders(headers: Record<string, string | string[] | undefined>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function createGuard(): InternalServiceGuard {
  return new InternalServiceGuard({ internalServiceToken: serviceToken } as ApplicationConfig);
}

describe('InternalServiceGuard', () => {
  it('пропускает запрос с верным креденшлом', () => {
    expect(
      createGuard().canActivate(
        contextWithHeaders({ [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken }),
      ),
    ).toBe(true);
  });

  it('отклоняет запрос без заголовка', () => {
    expect(() => createGuard().canActivate(contextWithHeaders({}))).toThrowError(
      UnauthorizedException,
    );
  });

  it('отклоняет неверный креденшл той же длины', () => {
    const wrong = `${'x'.repeat(serviceToken.length - 1)}y`;

    expect(() =>
      createGuard().canActivate(contextWithHeaders({ [INTERNAL_SERVICE_TOKEN_HEADER]: wrong })),
    ).toThrowError(UnauthorizedException);
  });

  it('отклоняет креденшл другой длины, не бросая ошибку сравнения', () => {
    expect(() =>
      createGuard().canActivate(
        contextWithHeaders({ [INTERNAL_SERVICE_TOKEN_HEADER]: `${serviceToken}extra` }),
      ),
    ).toThrowError(UnauthorizedException);
  });

  it('отклоняет повторённый заголовок, пришедший массивом', () => {
    expect(() =>
      createGuard().canActivate(
        contextWithHeaders({ [INTERNAL_SERVICE_TOKEN_HEADER]: [serviceToken, serviceToken] }),
      ),
    ).toThrowError(UnauthorizedException);
  });

  it('не раскрывает причину отказа', () => {
    const withoutHeader = (() => {
      try {
        createGuard().canActivate(contextWithHeaders({}));
        return undefined;
      } catch (error) {
        return (error as UnauthorizedException).message;
      }
    })();
    const withWrongToken = (() => {
      try {
        createGuard().canActivate(contextWithHeaders({ [INTERNAL_SERVICE_TOKEN_HEADER]: 'nope' }));
        return undefined;
      } catch (error) {
        return (error as UnauthorizedException).message;
      }
    })();

    expect(withoutHeader).toBe(withWrongToken);
  });
});
