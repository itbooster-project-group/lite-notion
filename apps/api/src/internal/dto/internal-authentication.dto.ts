/** Токен в ответ не попадает. `expiresAt` нужен collaboration для переавторизации. */
export class InternalAuthenticationDto {
  expiresAt!: string;
  sessionId!: string;
  userId!: string;

  static fromVerified(verified: {
    expiresAt: Date;
    sessionId: string;
    userId: string;
  }): InternalAuthenticationDto {
    return {
      expiresAt: verified.expiresAt.toISOString(),
      sessionId: verified.sessionId,
      userId: verified.userId,
    };
  }
}
