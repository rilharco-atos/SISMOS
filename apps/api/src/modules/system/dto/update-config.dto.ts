import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const SMS_MODES = ['test', 'production'] as const;

/** Campos editáveis da configuração do sistema. Passwords vazias mantêm o valor atual. */
export class UpdateConfigDto {
  @IsOptional() @IsString() @MaxLength(255) ftpHost?: string;
  @IsOptional() @IsString() @MaxLength(255) ftpUser?: string;
  @IsOptional() @IsString() @MaxLength(255) ftpPassword?: string;
  @IsOptional() @IsString() @MaxLength(500) ftpIncomingDir?: string;
  @IsOptional() @IsString() @MaxLength(500) ftpProcessedDir?: string;
  @IsOptional() @IsInt() @Min(5000) @Max(3600000) pollIntervalMs?: number;
  @IsOptional() @IsString() @MaxLength(255) smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsString() @MaxLength(255) smtpUser?: string;
  @IsOptional() @IsString() @MaxLength(255) smtpPassword?: string;
  @IsOptional() @IsString() @MaxLength(255) smtpFrom?: string;
  @IsOptional() @IsString() @MaxLength(11) smsSender?: string;
  @IsOptional() @IsIn(SMS_MODES as unknown as string[]) smsMode?: string;
  @IsOptional() @IsBoolean() envioAutomatico?: boolean;
  @IsOptional() @IsString() @MaxLength(255) emailRemetente?: string;
  @IsOptional() @IsString() @MaxLength(255) assinaturaTecnica?: string;
  @IsOptional() @IsString() @MaxLength(64) fusoHorario?: string;
}
