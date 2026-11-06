import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ListaKey } from '@prisma/client';
import { TEMPLATE_IDS } from '../templates';

const AREAS = ['Continente', 'Açores', 'Madeira'];
const MAX_XML = 256 * 1024;

/***********************************************************************************************************************
* @class         CreateComunicadoDto
* @description   Data transfer object for creating a new seismic bulletin via the manual form.
*                Covers all bulletin fields including optional XML source for audit purposes.
*
* @responsibilities
*                 - Validate mandatory fields: templateId, titulo and texto
*                 - Validate optional seismic event fields with appropriate type and length constraints
*                 - Validate that templateId and areaName are within the allowed enumerated values
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - xmlFonte is stored for audit purposes and limited to 256 KiB.
*                 - emailListas and smsListas allow immediate dispatch from the creation flow.
***********************************************************************************************************************/
export class CreateComunicadoDto {
  @IsIn(TEMPLATE_IDS as unknown as string[]) templateId: string;
  @IsOptional() @IsBoolean() primeiraPagina?: boolean;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsString() @IsNotEmpty() @MaxLength(300) titulo: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) texto: string;
  @IsOptional() @IsString() @MaxLength(300) local?: string;
  @IsOptional() @IsIn(AREAS) areaName?: string;
  @IsOptional() @IsDateString() eventDateTime?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lon?: number;
  @IsOptional() @IsNumber() depth?: number;
  @IsOptional() @IsNumber() magnitude?: number;
  @IsOptional() @IsString() @MaxLength(20) intmax?: string;
  @IsOptional() @IsString() @MaxLength(300) regiaoIntmax?: string;
  @IsOptional() @IsString() @MaxLength(5000) infoMacrossAdicional?: string;
  @IsOptional() @IsString() @MaxLength(2000) klmLink?: string;
  @IsOptional() @IsString() @MaxLength(300) imagemUrl?: string;
  @IsOptional() @IsDateString() websiteInicio?: string;
  @IsOptional() @IsDateString() websiteFim?: string;
  @IsOptional() @IsBoolean() publicarWebsite?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) smsListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) emailListas?: ListaKey[];
  @IsOptional() @IsString() @MaxLength(MAX_XML) xmlFonte?: string;
}

/***********************************************************************************************************************
* @class         NovaVersaoDto
* @description   Data transfer object for creating a new content version (002, 003, …) of an existing
*                bulletin. Titulo and texto are mandatory; all other fields update the bulletin metadata.
*
* @responsibilities
*                 - Validate mandatory titulo and texto for the new version content
*                 - Validate optional fields that override the base bulletin's metadata for this version
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - A new version generates a new PDF and resets the dispatch state for that version.
*                 - Optional seismic fields allow correction of data errors in subsequent versions.
***********************************************************************************************************************/
export class NovaVersaoDto {
  @IsString() @IsNotEmpty() @MaxLength(300) titulo: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) texto: string;
  @IsOptional() @IsIn(TEMPLATE_IDS as unknown as string[]) templateId?: string;
  @IsOptional() @IsString() @MaxLength(300) imagemUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) local?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lon?: number;
  @IsOptional() @IsNumber() depth?: number;
  @IsOptional() @IsNumber() magnitude?: number;
  @IsOptional() @IsString() @MaxLength(20) intmax?: string;
  @IsOptional() @IsString() @MaxLength(300) regiaoIntmax?: string;
  @IsOptional() @IsString() @MaxLength(5000) infoMacrossAdicional?: string;
  @IsOptional() @IsBoolean() primeiraPagina?: boolean;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) smsListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) emailListas?: ListaKey[];
  @IsOptional() @IsString() @MaxLength(MAX_XML) xmlFonte?: string;
}

/***********************************************************************************************************************
* @class         PreencherTemplateDto
* @description   Data transfer object for requesting template pre-population with seismic event data.
*                Returns suggested titulo and texto strings for the analyst to review and adjust.
*
* @responsibilities
*                 - Validate templateId against the allowed template catalogue
*                 - Validate optional event data fields used to populate the template placeholders
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - The returned text is a suggestion; analysts always review before creating the bulletin.
*                 - eventDateTime is accepted as a string here and parsed to Date in the controller.
***********************************************************************************************************************/
export class PreencherTemplateDto {
  @IsIn(TEMPLATE_IDS as unknown as string[]) templateId: string;
  @IsOptional() @IsIn(AREAS) areaName?: string;
  @IsOptional() @IsDateString() eventDateTime?: string;
  @IsOptional() @IsNumber() magnitude?: number;
  @IsOptional() @IsString() @MaxLength(300) local?: string;
  @IsOptional() @IsString() @MaxLength(20) intmax?: string;
  @IsOptional() @IsString() @MaxLength(300) regiaoIntmax?: string;
  @IsOptional() @IsString() @MaxLength(5000) infoMacrossAdicional?: string;
}
