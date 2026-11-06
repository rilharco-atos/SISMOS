import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body, Query, UseGuards, Request, UseInterceptors, UploadedFile, Res,
  BadRequestException, ForbiddenException, NotFoundException, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComunicadosService } from './comunicados.service';
import { CreateComunicadoDto, NovaVersaoDto, PreencherTemplateDto } from './dto/create-comunicado.dto';
import { UpdateComunicadoDto } from './dto/update-comunicado.dto';
import { tipoImagem } from './documento';
import { StorageService } from '../storage/storage.service';

const MAX_XML_BYTES = 256 * 1024;
const MAX_IMAGEM_BYTES = 5 * 1024 * 1024;

/***********************************************************************************************************************
* @class         ComunicadosController
* @description   NestJS REST controller that exposes all bulletin (comunicado) management endpoints.
*                Protected by JWT authentication. Handles the full bulletin lifecycle from creation
*                through approval, versioning, dispatch and website publication.
*
* @responsibilities
*                 - CRUD operations for seismic bulletins
*                 - XML upload and automatic pre-population of the bulletin form
*                 - Image (intensity map) upload and storage
*                 - New version creation for issued bulletins
*                 - State transitions: approve, cancel, archive
*                 - Website publication and removal
*                 - PDF download for specific bulletin versions
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - File size limits: 256 KiB for XML, 5 MiB for images.
*                 - Deletion is restricted to ADMIN role; all other operations require authentication only.
*                 - PDF is streamed directly from StorageService with Cache-Control: private, no-store.
***********************************************************************************************************************/
@ApiTags('comunicados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comunicados')
export class ComunicadosController {
  constructor(private svc: ComunicadosService, private storage: StorageService) {}

  /*********************************************************************************************************************
  * @method       kpis
  * @description  Returns aggregated KPI counts for the dashboard (bulletins by state, recent activity).
  * @return       KPI object from ComunicadosService.getKpis
  * @uses         ComunicadosService.getKpis
  *********************************************************************************************************************/
  @Get('kpis')
  kpis() { return this.svc.getKpis(); }

  /*********************************************************************************************************************
  * @method       templates
  * @description  Returns the list of available bulletin templates with their labels and field definitions.
  * @return       Array of template descriptors
  * @uses         ComunicadosService.listarTemplates
  *********************************************************************************************************************/
  @Get('templates')
  templates() { return this.svc.listarTemplates(); }

  /*********************************************************************************************************************
  * @method       preencher
  * @description  Fills a bulletin template with event data and returns pre-populated titulo and texto.
  * @param        dto — PreencherTemplateDto with templateId and event fields
  * @return       Object with titulo and texto strings
  * @uses         ComunicadosService.preencher
  *********************************************************************************************************************/
  @Post('templates/preencher')
  preencher(@Body() dto: PreencherTemplateDto) {
    const { templateId, eventDateTime, ...resto } = dto;
    return this.svc.preencher(templateId, { ...resto, eventDateTime: eventDateTime ? new Date(eventDateTime) : null });
  }

  /*********************************************************************************************************************
  * @method       analisarXml
  * @description  Parses the uploaded IPMA seismic XML file and returns the extracted event fields for
  *               pre-filling the bulletin form. Accepts multipart/form-data with a 256 KiB size limit.
  * @param        file — uploaded XML file from the multipart request
  * @return       Parsed event data object
  * @uses         ComunicadosService.analisarXml, ComunicadosController.lerXml
  *********************************************************************************************************************/
  @Post('xml/analisar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES } }))
  analisarXml(@UploadedFile() file: Express.Multer.File) {
    return this.svc.analisarXml(this.lerXml(file));
  }

  /*********************************************************************************************************************
  * @method       uploadImagemAvulsa
  * @description  Uploads an intensity map image independently of a specific bulletin. Returns the storage
  *               URL to attach to a bulletin later. Accepts PNG or JPEG up to 5 MiB.
  * @param        file — uploaded image file from the multipart request
  * @return       Object with imagemUrl storage path
  * @uses         ComunicadosController.gravarImagem
  *********************************************************************************************************************/
  @Post('imagens')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('imagem', { limits: { fileSize: MAX_IMAGEM_BYTES } }))
  async uploadImagemAvulsa(@UploadedFile() file: Express.Multer.File) {
    return { imagemUrl: await this.gravarImagem(file) };
  }

  /*********************************************************************************************************************
  * @method       findAll
  * @description  Returns all bulletins, optionally filtered by state, area, free-text search and month.
  * @param        estado — optional ComunicadoEstado filter
  * @param        areaName — optional area name filter
  * @param        search — optional free-text search string
  * @param        mes — optional month filter in YYYY-MM format
  * @return       Array of bulletin summaries
  * @uses         ComunicadosService.findAll
  *********************************************************************************************************************/
  @Get()
  findAll(@Query('estado') estado?: string, @Query('areaName') areaName?: string, @Query('search') search?: string, @Query('mes') mes?: string) {
    return this.svc.findAll({ estado, areaName, search, mes });
  }

  /*********************************************************************************************************************
  * @method       findOne
  * @description  Returns a single bulletin by id, including all versions and delivery records.
  * @param        id — bulletin UUID from the URL path
  * @return       Full bulletin record with versions, email envios and SMS envios
  * @uses         ComunicadosService.findOne
  *********************************************************************************************************************/
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.findOne(id); }

  /*********************************************************************************************************************
  * @method       create
  * @description  Creates a new seismic bulletin from the manual form submission.
  * @param        dto — CreateComunicadoDto with all bulletin fields
  * @param        req — Express request with the authenticated user for audit logging
  * @return       Created bulletin record
  * @uses         ComunicadosService.create
  *********************************************************************************************************************/
  @Post()
  create(@Body() dto: CreateComunicadoDto, @Request() req: any) {
    return this.svc.create(dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       importarXml
  * @description  Creates a bulletin directly from an uploaded IPMA XML file, using the same parsing
  *               pipeline as the automatic FTP polling flow.
  * @param        file — uploaded XML file from the multipart request
  * @param        req — Express request with the authenticated user for audit logging
  * @return       Created bulletin record
  * @uses         ComunicadosService.createFromXml, ComunicadosController.lerXml
  *********************************************************************************************************************/
  @Post('importar-xml')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES } }))
  importarXml(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.svc.createFromXml(this.lerXml(file), req.user.id);
  }

  /*********************************************************************************************************************
  * @method       update
  * @description  Updates bulletin metadata fields that do not generate a new version.
  * @param        id — bulletin UUID from the URL path
  * @param        dto — UpdateComunicadoDto with the fields to update
  * @param        req — Express request with the authenticated user for audit logging
  * @return       Updated bulletin record
  * @uses         ComunicadosService.update
  *********************************************************************************************************************/
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComunicadoDto, @Request() req: any) {
    return this.svc.update(id, dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       novaVersao
  * @description  Creates a new version (002, 003, …) of an existing bulletin with updated content.
  * @param        id — bulletin UUID from the URL path
  * @param        dto — NovaVersaoDto with titulo, texto and optional updated fields
  * @param        req — Express request with the authenticated user for audit logging
  * @return       New version record
  * @uses         ComunicadosService.criarNovaVersao
  *********************************************************************************************************************/
  @Post(':id/versoes')
  novaVersao(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NovaVersaoDto, @Request() req: any) {
    return this.svc.criarNovaVersao(id, dto, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       aprovar
  * @description  Transitions the bulletin state to APROVADO.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user for audit logging
  * @uses         ComunicadosService.aprovar
  *********************************************************************************************************************/
  @Patch(':id/aprovar')
  aprovar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.aprovar(id, req.user.id); }

  /*********************************************************************************************************************
  * @method       cancelar
  * @description  Transitions the bulletin state to CANCELADO.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user for audit logging
  * @uses         ComunicadosService.cancelar
  *********************************************************************************************************************/
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.cancelar(id, req.user.id); }

  /*********************************************************************************************************************
  * @method       arquivar
  * @description  Transitions the bulletin state to ARQUIVADO.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user for audit logging
  * @uses         ComunicadosService.arquivar
  *********************************************************************************************************************/
  @Patch(':id/arquivar')
  arquivar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.arquivar(id, req.user.id); }

  /*********************************************************************************************************************
  * @method       integracaoWebsite
  * @description  Returns the current website integration status (active provider, URL and error if any).
  * @return       Website integration state object
  * @uses         ComunicadosService.estadoIntegracaoWebsite
  *********************************************************************************************************************/
  @Get('website/integracao')
  integracaoWebsite() { return this.svc.estadoIntegracaoWebsite(); }

  /*********************************************************************************************************************
  * @method       publicarWebsite
  * @description  Publishes the bulletin's latest approved version to the configured website integration.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user for audit logging
  * @uses         ComunicadosService.publicarWebsite
  *********************************************************************************************************************/
  @Post(':id/website/publicar')
  publicarWebsite(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.publicarWebsite(id, req.user.id); }

  /*********************************************************************************************************************
  * @method       removerWebsite
  * @description  Removes the bulletin from the configured website integration.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user for audit logging
  * @uses         ComunicadosService.removerWebsite
  *********************************************************************************************************************/
  @Post(':id/website/remover')
  removerWebsite(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.removerWebsite(id, req.user.id); }

  /*********************************************************************************************************************
  * @method       remove
  * @description  Permanently deletes a bulletin. Restricted to ADMIN role.
  * @param        id — bulletin UUID from the URL path
  * @param        req — Express request with the authenticated user (for role check and audit)
  * @uses         ComunicadosService.remove
  *********************************************************************************************************************/
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores podem apagar comunicados');
    return this.svc.remove(id, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       uploadImagem
  * @description  Uploads and attaches an intensity map image directly to an existing bulletin.
  * @param        id — bulletin UUID from the URL path
  * @param        file — uploaded image file from the multipart request
  * @param        req — Express request with the authenticated user for audit logging
  * @return       Updated bulletin record with new imagemUrl
  * @uses         ComunicadosController.gravarImagem, ComunicadosService.update
  *********************************************************************************************************************/
  @Post(':id/imagem')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('imagem', { limits: { fileSize: MAX_IMAGEM_BYTES } }))
  async uploadImagem(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.svc.update(id, { imagemUrl: await this.gravarImagem(file) }, req.user.id);
  }

  /*********************************************************************************************************************
  * @method       downloadPdf
  * @description  Streams the PDF for a specific bulletin version with appropriate content headers.
  *               Sets Cache-Control: private, no-store to prevent proxy caching.
  * @param        id — bulletin UUID from the URL path
  * @param        versaoId — version UUID from the URL path
  * @param        res — Express response object for streaming the PDF bytes
  * @uses         ComunicadosService.findOne, StorageService.ler
  *********************************************************************************************************************/
  @Get(':id/versoes/:versaoId/pdf')
  async downloadPdf(@Param('id', ParseUUIDPipe) id: string, @Param('versaoId', ParseUUIDPipe) versaoId: string, @Res() res: Response) {
    const comunicado = await this.svc.findOne(id);
    const versao = comunicado.versoes.find(v => v.id === versaoId);
    const ficheiro = await this.storage.ler(versao?.pdfPath);
    if (!ficheiro) throw new NotFoundException('PDF não encontrado');
    const nome = `${comunicado.referencia.replace(/[^A-Za-z0-9-]/g, '_')}_v${String(versao!.numero).padStart(3, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(ficheiro.conteudo);
  }

  /*********************************************************************************************************************
  * @method       lerXml
  * @description  Validates and reads the uploaded XML file buffer to a UTF-8 string, stripping the
  *               BOM if present. Throws BadRequestException for missing or non-XML files.
  * @param        file — uploaded file from the multipart request
  * @return       UTF-8 XML string ready for parsing
  *********************************************************************************************************************/
  private lerXml(file?: Express.Multer.File): string {
    if (!file?.buffer?.length) throw new BadRequestException('Ficheiro XML não enviado');
    if (!/\.xml$/i.test(file.originalname)) throw new BadRequestException('O ficheiro tem de ter extensão .xml');
    return file.buffer.toString('utf-8').replace(/^﻿/, '');
  }

  /*********************************************************************************************************************
  * @method       gravarImagem
  * @description  Validates the uploaded image buffer type and stores it in StorageService with a UUID
  *               key under the imagens/ prefix.
  * @param        file — uploaded image file from the multipart request
  * @return       Storage key string for the saved image
  * @uses         tipoImagem, StorageService.guardar
  *********************************************************************************************************************/
  private async gravarImagem(file?: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Imagem não enviada');
    const tipo = tipoImagem(file.buffer);
    if (!tipo) throw new BadRequestException('Apenas imagens PNG ou JPEG são aceites');
    const chave = `imagens/${randomUUID()}.${tipo === 'png' ? 'png' : 'jpg'}`;
    return this.storage.guardar(chave, file.buffer, tipo === 'png' ? 'image/png' : 'image/jpeg');
  }
}
