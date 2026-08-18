import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

type ErrorMessage = string | string[];

interface ErrorResponse {
  error: string;
  message: ErrorMessage;
  path: string;
  statusCode: number;
  timestamp: string;
}

interface RequestWithUrl {
  originalUrl?: string;
  url?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorMessage(value: unknown): value is ErrorMessage {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithUrl>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const fallbackError = STATUS_CODES[statusCode] ?? 'Error';
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const { error, message } = this.normalizeExceptionResponse(exceptionResponse, fallbackError);

    if (!(exception instanceof HttpException)) {
      this.logUnexpectedException(exception);
    }

    const response: ErrorResponse = {
      error,
      message,
      path: request.originalUrl ?? request.url ?? '',
      statusCode,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(context.getResponse(), response, statusCode);
  }

  private logUnexpectedException(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      return;
    }

    this.logger.error('Unknown non-Error exception');
  }

  private normalizeExceptionResponse(
    response: object | string | undefined,
    fallbackError: string,
  ): Pick<ErrorResponse, 'error' | 'message'> {
    if (typeof response === 'string') {
      return { error: fallbackError, message: response };
    }

    if (isRecord(response)) {
      return {
        error: typeof response.error === 'string' ? response.error : fallbackError,
        message: isErrorMessage(response.message) ? response.message : fallbackError,
      };
    }

    return {
      error: fallbackError,
      message:
        fallbackError === STATUS_CODES[HttpStatus.INTERNAL_SERVER_ERROR]
          ? 'Internal server error'
          : fallbackError,
    };
  }
}
