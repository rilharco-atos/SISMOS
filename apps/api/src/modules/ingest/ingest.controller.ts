import { Controller, Post, UseGuards, UseInterceptors, UploadedFile, Req, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Request } from 'express';
import { IngestApiKeyGuard } from './api-key.guard';
import { ComunicadosService, SYSTEM_USER_ID } from '../comunicados/comunicados.service';
import { AuditService } from '../audit/audit.service';
import { PollingService } from '../polling/polling.service';

const MAX_XML_BYTES = 256 * 1024;

/***********************************************************************************************************************
* @class         IngestController
* @description   NestJS REST controller for receiving seismic XML bulletins from the PONTE integration
*                and any other authenticated external system. Creates a Comunicado from the XML and
*                optionally triggers the automatic dispatch flow.
*
* @responsibilities
*                 - Accept XML via multipart/form-data (field "file") or application/xml body
*                 - Authenticate callers using the IngestApiKeyGuard (X-Api-Key header)
*                 - Enforce a 256 KiB maximum size on received XML payloads
*                 - Create a Comunicado via ComunicadosService.createFromXml
*                 - Log the ingest event to the audit trail
*                 - Trigger the automatic dispatch flow when enabled
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - SYSTEM_USER_ID is used as the acting user for all ingest operations.
*                 - The BOM character (U+FEFF) is stripped from XML payloads before parsing.
*                 - envioAutomatico() is called with source 'ponte-ingest' so that polling metrics
*                   can distinguish FTP-sourced from PONTE-sourced bulletins.
***********************************************************************************************************************/
@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(
    private comunicados: ComunicadosService,
    private audit: AuditService,
    private polling: PollingService,
  ) {}

  /*********************************************************************************************************************
  * @method       ingestXml
  * @description  Receives a seismic XML bulletin and creates the corresponding Comunicado. Accepts
  *               the XML either as a multipart file upload (field "file", extension must be .xml)
  *               or as a raw application/xml or text/xml request body.
  * @param        file — optional uploaded file from the FileInterceptor (multipart/form-data)
  * @param        req — Express request; req.body is the raw XML string when sent as application/xml
  * @return       Promise resolving to { comunicadoId, referencia, estado, templateId }
  * @uses         ComunicadosService.createFromXml, AuditService.log, PollingService.envioAutomatico
  *********************************************************************************************************************/
  @Post('xml')
  @UseGuards(IngestApiKeyGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES } }))
  @ApiOperation({ summary: 'Ingestão de XML sismológico (autenticação por API key)' })
  @ApiConsumes('multipart/form-data', 'application/xml', 'text/xml')
  async ingestXml(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    let xml: string;

    if (file?.buffer?.length) {
      if (!/\.xml$/i.test(file.originalname ?? '')) throw new BadRequestException('O ficheiro tem de ter extensão .xml');
      xml = file.buffer.toString('utf-8').replace(/^﻿/, '');
    } else if (Buffer.isBuffer(req.body) && req.body.length) {
      // Body capturado pelo express.raw() — aceita qualquer Content-Type (inclui application/json com XML dentro)
      let raw = req.body.toString('utf-8').replace(/^﻿/, '').trim();
      // Se a Ponte envolver o XML numa string JSON ("...xml..."), desembrulhar
      if (raw.startsWith('"')) {
        try { raw = JSON.parse(raw) as string; } catch { /* usar como está */ }
      }
      xml = raw;
    } else if (typeof req.body === 'string' && req.body.trim()) {
      xml = req.body.trim();
    } else {
      throw new BadRequestException('Envie o XML como ficheiro multipart (campo "file") ou como body application/xml');
    }

    if (Buffer.byteLength(xml, 'utf-8') > MAX_XML_BYTES) throw new BadRequestException('Ficheiro XML demasiado grande');

    this.logger.log(JSON.stringify({ msg: 'Ingestão XML recebida via PONTE', tamanho: xml.length }));

    const comunicado = await this.comunicados.createFromXml(xml, SYSTEM_USER_ID);

    await this.audit.log({
      userId: SYSTEM_USER_ID,
      acao: 'INGEST_XML_PONTE',
      entidade: 'Comunicado',
      entidadeId: comunicado.id,
      comunicadoId: comunicado.id,
      detalhes: { referencia: comunicado.referencia, templateId: comunicado.templateId },
    });

    this.logger.log(JSON.stringify({ msg: 'Comunicado criado via PONTE', referencia: comunicado.referencia, id: comunicado.id }));

    await this.polling.envioAutomatico(comunicado, 'ponte-ingest');

    return {
      comunicadoId: comunicado.id,
      referencia: comunicado.referencia,
      estado: comunicado.estado,
      templateId: comunicado.templateId,
    };
  }
}
