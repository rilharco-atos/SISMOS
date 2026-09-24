import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ListaKey } from '@prisma/client';
import { TEMPLATE_IDS } from '../templates';

const AREAS = ['Continente', 'Açores', 'Madeira'];
const MAX_XML = 256 * 1024;

/** Dados de criação de um comunicado (formulário manual, com ou sem XML de origem). */
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
  /** XML carregado pelo analista (substitui o antigo .csv); guardado para auditoria. */
  @IsOptional() @IsString() @MaxLength(MAX_XML) xmlFonte?: string;
}

/** Dados de uma nova versão (002, 003, …) de um comunicado existente. */
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

/** Pedido de preenchimento de template com os dados do evento. */
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
