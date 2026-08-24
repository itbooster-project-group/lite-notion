import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { applicationConfig } from '../config/application-config';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRepository, PrismaAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './crypto/password.service';
import { TokenService } from './crypto/token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { SessionService } from './session/session.service';
import { SessionCleanupService } from './session/session-cleanup.service';

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
    { provide: AuthRepository, useClass: PrismaAuthRepository },
    // Закрывает все маршруты приложения; публичные помечаются через @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
