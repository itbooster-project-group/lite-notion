import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PublishPageDto {
  @ApiProperty({ example: 'team-roadmap', maxLength: 100, type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;
}
