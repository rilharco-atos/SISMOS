import { Controller, Post, Get, Param, Body, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, IsOptional } from 'class-validator';
import { ListaKey } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryService } from './delivery.service';

/***********************************************************************************************************************
* @class         EnviarDto
* @description   Data transfer object for the bulletin dispatch request. Allows the caller to specify
*                separate recipient lists for email and SMS, with a legacy 'listas' fallback for both.
*
* @responsibilities
*                 - Validate that each list key is a valid ListaKey enum value
*                 - Ensure no duplicate list keys within each channel
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - 'listas' is the legacy field applied to both channels when the specific fields are absent.
*                 - All fields are optional; validation is performed at the service layer.
***********************************************************************************************************************/
export class EnviarDto {
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) emailListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) smsListas?: ListaKey[];
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(ListaKey, { each: true }) listas?: ListaKey[];
}

/***********************************************************************************************************************
* @class         DeliveryController
* @description   NestJS REST controller that exposes bulletin dispatch endpoints. Protected by JWT auth.
*                Delegates email, SMS and website publishing to DeliveryService.
*
* @responsibilities
*                 - Accept dispatch requests for a specific bulletin version to email and SMS lists
*                 - Provide an HTML preview of the bulletin email before sending
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - emailListas and smsListas take precedence over the legacy 'listas' field.
*                 - The preview endpoint serves inline images as data URIs for browser rendering.
***********************************************************************************************************************/
@ApiTags('delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private svc: DeliveryService) {}

  /*********************************************************************************************************************
  * @method       enviar
  * @description  Handles POST /delivery/:comunicadoId/versoes/:versaoId/enviar. Dispatches the specified
  *               bulletin version to the requested email and SMS lists, then publishes to the website.
  * @param        comunicadoId — bulletin UUID from the URL path
  * @param        versaoId — version UUID from the URL path
  * @param        dto — EnviarDto with emailListas, smsListas and legacy listas fields
  * @param        req — Express request with the authenticated user for audit logging
  * @return       Dispatch result with email/SMS counts, failure counts and website publication status
  * @uses         DeliveryService.enviarComunicado
  *********************************************************************************************************************/
  @Post(':comunicadoId/versoes/:versaoId/enviar')
  enviar(
    @Param('comunicadoId', ParseUUIDPipe) comunicadoId: string,
    @Param('versaoId', ParseUUIDPipe) versaoId: string,
    @Body() dto: EnviarDto,
    @Request() req: any,
  ) {
    return this.svc.enviarComunicado(comunicadoId, versaoId, dto.emailListas ?? dto.listas ?? [], dto.smsListas ?? dto.listas ?? [], req.user.id);
  }

  /*********************************************************************************************************************
  * @method       preview
  * @description  Handles GET /delivery/:comunicadoId/versoes/:versaoId/email-preview. Returns the HTML
  *               body of the bulletin email with inline images embedded as data URIs for browser preview.
  * @param        comunicadoId — bulletin UUID from the URL path
  * @param        versaoId — version UUID from the URL path
  * @return       Object with html string containing the fully inline email body
  * @uses         DeliveryService.preVisualizarEmail
  *********************************************************************************************************************/
  @Get(':comunicadoId/versoes/:versaoId/email-preview')
  async preview(@Param('comunicadoId', ParseUUIDPipe) comunicadoId: string, @Param('versaoId', ParseUUIDPipe) versaoId: string) {
    return { html: await this.svc.preVisualizarEmail(comunicadoId, versaoId) };
  }
}
