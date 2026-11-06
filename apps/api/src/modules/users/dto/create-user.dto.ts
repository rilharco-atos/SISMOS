import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

/***********************************************************************************************************************
* @class         CreateUserDto
* @description   Data transfer object for creating a new user account. Validates all required fields
*                with class-validator decorators before the request reaches the service layer.
*
* @responsibilities
*                 - Validate that name and password are non-empty strings
*                 - Validate that email is a valid email format
*                 - Validate that password meets the minimum 8-character length requirement
*                 - Validate that role is a valid UserRole enum value
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Password is accepted in plain text here and bcrypt-hashed in UsersService.create().
*                 - role must be one of the Prisma UserRole enum values (e.g. ADMIN or OPERATOR).
***********************************************************************************************************************/
export class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(UserRole) role: UserRole;
}
