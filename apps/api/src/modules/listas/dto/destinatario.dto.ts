import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ListaKey } from '@prisma/client';

const TELEFONE = /^\+?[0-9 ]{9,20}$/;
const vazioParaUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

/***********************************************************************************************************************
* @class         CreateDestinatarioDto
* @description   Data transfer object for creating a new dissemination list recipient.
*                At least one of email or telefone must be present; both are optional individually.
*
* @responsibilities
*                 - Validate nome as required string up to 200 characters
*                 - Validate email as a proper email address when present
*                 - Validate telefone against the E.164-like pattern when present
*                 - Validate listas as a non-empty array of known ListaKey enum values
*                 - Enforce the constraint that at least one contact field must be provided
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Empty strings are transformed to undefined by vazioParaUndefined so that the
*                   presence validators reject them correctly.
*                 - The contacto virtual field drives the cross-field "at least one" validation rule.
***********************************************************************************************************************/
export class CreateDestinatarioDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nome: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsString() @MaxLength(200) organizacao?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(vazioParaUndefined) @Matches(TELEFONE, { message: 'telefone inválido (9 a 20 dígitos, opcionalmente com +)' }) telefone?: string;
  @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas: ListaKey[];
  @IsOptional() @IsBoolean() interno?: boolean;
  @ValidateIf(o => !o.email && !o.telefone) @IsNotEmpty({ message: 'Indique pelo menos email ou telefone' }) contacto?: never;
}

/***********************************************************************************************************************
* @class         UpdateDestinatarioDto
* @description   Data transfer object for updating a dissemination list recipient. All fields are
*                optional. Empty email or telefone strings are mapped to undefined so that callers
*                who receive masked values cannot accidentally wipe the stored contact data.
*
* @responsibilities
*                 - Validate all optional fields with the same rules as CreateDestinatarioDto
*                 - Allow partial updates with any combination of the available fields
*                 - Support replacing all list memberships via the optional listas array
*                 - Support toggling the ativo flag on all current list memberships
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - When listas is present in the update payload, all existing DestinatarioLista rows
*                   are deleted and recreated with the new list. This is a full replacement, not a patch.
*                 - When only ativo is present, it is applied to all existing list memberships.
***********************************************************************************************************************/
export class UpdateDestinatarioDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nome?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsString() @MaxLength(200) organizacao?: string;
  @IsOptional() @Transform(vazioParaUndefined) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Transform(vazioParaUndefined) @Matches(TELEFONE, { message: 'telefone inválido (9 a 20 dígitos, opcionalmente com +)' }) telefone?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas?: ListaKey[];
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsBoolean() interno?: boolean;
}
