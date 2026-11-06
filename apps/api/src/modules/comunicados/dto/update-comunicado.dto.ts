import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListaKey } from '@prisma/client';

/***********************************************************************************************************************
* @class         UpdateComunicadoDto
* @description   Data transfer object for updating bulletin metadata fields that do not generate a new
*                content version. Used for corrections to scheduling, images and dispatch lists.
*
* @responsibilities
*                 - Validate all optional update fields with appropriate type and length constraints
*                 - Allow partial updates with any combination of the available fields
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Content changes (titulo, texto) through this DTO do NOT create a new versao record.
*                 - For content corrections that require versioning, use NovaVersaoDto instead.
***********************************************************************************************************************/
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
