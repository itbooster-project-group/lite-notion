import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { applicationConfig } from '../config/application-config';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { PrismaSessionRepository, SessionRepository } from './session.repository';
import { SessionService } from './session.service';
import { SessionCleanupService } from './session-cleanup.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  imports: [
    DatabaseModule,
    PassportModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [applicationConfig.KEY],
      useFactory: (config: ConfigType<typeof applicationConfig>) => ({ secret: config.jwtSecret }),
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordService,
    SessionCleanupService,
    SessionService,
    TokenService,
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    // Закрывает все маршруты приложения; публичные помечаются через @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
