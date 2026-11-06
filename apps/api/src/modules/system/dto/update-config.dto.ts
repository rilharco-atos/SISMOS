import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const SMS_MODES = ['test', 'production'] as const;

/***********************************************************************************************************************
* @class         UpdateConfigDto
* @description   Data transfer object for updating the singleton system configuration row.
*                All fields are optional. Empty password fields are silently ignored by
*                SystemService.updateConfig() so that masked UI placeholders do not overwrite secrets.
*
* @responsibilities
*                 - Validate FTP connection parameters (host, user, password, dirs, poll interval)
*                 - Validate SMTP transport parameters (host, port, user, password, from address)
*                 - Validate the SMS sender identifier and dispatch mode
*                 - Validate optional display and timezone fields
*                 - Carry the ingestApiKey field (written only via POST /system/ingest-api-key/gerar)
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - smsSender supports both alphanumeric IDs (max 11 chars for SMSExpress MEO)
*                   and E.164-style numbers ('+' + up to 15 digits), so the max length is 16.
*                 - ingestApiKey in this DTO is accepted but SystemService drops it; the key is
*                   generated exclusively via POST /system/ingest-api-key/gerar.
***********************************************************************************************************************/
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
  @IsOptional() @IsString() @MaxLength(16) smsSender?: string;
  @IsOptional() @IsIn(SMS_MODES as unknown as string[]) smsMode?: string;
  @IsOptional() @IsBoolean() envioAutomatico?: boolean;
  @IsOptional() @IsString() @MaxLength(255) emailRemetente?: string;
  @IsOptional() @IsString() @MaxLength(255) assinaturaTecnica?: string;
  @IsOptional() @IsString() @MaxLength(64) fusoHorario?: string;
  @IsOptional() @IsString() @MaxLength(200) ingestApiKey?: string;
}
