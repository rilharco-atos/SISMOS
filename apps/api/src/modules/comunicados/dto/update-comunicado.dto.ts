import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListaKey } from '@prisma/client';

/** Alterações de metadados de um comunicado que não geram nova versão. */
export class UpdateComunicadoDto {
  @IsOptional() @IsString() @MaxLength(300) titulo?: string;
  @IsOptional() @IsString() @MaxLength(20000) texto?: string;
  @IsOptional() @IsString() @MaxLength(300) imagemUrl?: string;
  @IsOptional() @IsDateString() websiteInicio?: string;
  @IsOptional() @IsDateString() websiteFim?: string;
  @IsOptional() @IsBoolean() primeiraPagina?: boolean;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) smsListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) emailListas?: ListaKey[];
}
