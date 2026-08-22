import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersService } from './users.service';

@Module({
  exports: [UsersService],
  imports: [DatabaseModule],
  providers: [UsersService],
})
export class UsersModule {}
