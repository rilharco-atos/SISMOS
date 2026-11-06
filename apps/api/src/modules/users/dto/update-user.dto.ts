import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

/***********************************************************************************************************************
* @class         UpdateUserDto
* @description   Data transfer object for updating an existing user account. All fields are optional;
*                only the fields that are provided are updated in the database.
*
* @responsibilities
*                 - Validate each optional field when present with class-validator decorators
*                 - Allow partial updates with any combination of name, role, active and password
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - When password is provided, UsersService.update() re-hashes it before persisting.
*                 - The active field allows admins to deactivate accounts without deleting them.
***********************************************************************************************************************/
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}
