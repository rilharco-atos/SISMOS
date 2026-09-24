import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ListaKey } from '@prisma/client';

const TELEFONE = /^\+?[0-9 ]{9,20}$/;
const vazioParaUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

/** Novo destinatário de uma ou mais listas de disseminação. */
export class CreateDestinatarioDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nome: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsString() @MaxLength(200) organizacao?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(vazioParaUndefined) @Matches(TELEFONE, { message: 'telefone inválido (9 a 20 dígitos, opcionalmente com +)' }) telefone?: string;
  @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas: ListaKey[];
  @IsOptional() @IsBoolean() interno?: boolean;
  @ValidateIf(o => !o.email && !o.telefone) @IsNotEmpty({ message: 'Indique pelo menos email ou telefone' }) contacto?: never;
}

/** Alteração de destinatário. Email/telefone vazios mantêm o valor atual (os valores vêm mascarados na listagem). */
export class UpdateDestinatarioDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nome?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsString() @MaxLength(200) organizacao?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(vazioParaUndefined) @Matches(TELEFONE, { message: 'telefone inválido (9 a 20 dígitos, opcionalmente com +)' }) telefone?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas?: ListaKey[];
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsBoolean() interno?: boolean;
}
