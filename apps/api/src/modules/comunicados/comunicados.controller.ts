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

@ApiTags('comunicados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comunicados')
export class ComunicadosController {
  constructor(private svc: ComunicadosService, private storage: StorageService) {}

  @Get('kpis')
  kpis() { return this.svc.getKpis(); }

  @Get('templates')
  templates() { return this.svc.listarTemplates(); }

  @Post('templates/preencher')
  preencher(@Body() dto: PreencherTemplateDto) {
    const { templateId, eventDateTime, ...resto } = dto;
    return this.svc.preencher(templateId, { ...resto, eventDateTime: eventDateTime ? new Date(eventDateTime) : null });
  }

  /** Analisa o XML carregado pelo analista e devolve os dados para pré-preencher o formulário. */
  @Post('xml/analisar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES } }))
  analisarXml(@UploadedFile() file: Express.Multer.File) {
    return this.svc.analisarXml(this.lerXml(file));
  }

  /** Carrega a imagem (mapa de intensidades) a anexar ao comunicado. */
  @Post('imagens')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('imagem', { limits: { fileSize: MAX_IMAGEM_BYTES } }))
  async uploadImagemAvulsa(@UploadedFile() file: Express.Multer.File) {
    return { imagemUrl: await this.gravarImagem(file) };
  }

  @Get()
  findAll(@Query('estado') estado?: string, @Query('areaName') areaName?: string, @Query('search') search?: string, @Query('mes') mes?: string) {
    return this.svc.findAll({ estado, areaName, search, mes });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.svc.findOne(id); }

  @Post()
  create(@Body() dto: CreateComunicadoDto, @Request() req: any) {
    return this.svc.create(dto, req.user.id);
  }

  /** Cria o comunicado diretamente a partir do XML (mesmo tratamento do fluxo automático). */
  @Post('importar-xml')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_XML_BYTES } }))
  importarXml(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.svc.createFromXml(this.lerXml(file), req.user.id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComunicadoDto, @Request() req: any) {
    return this.svc.update(id, dto, req.user.id);
  }

  @Post(':id/versoes')
  novaVersao(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NovaVersaoDto, @Request() req: any) {
    return this.svc.criarNovaVersao(id, dto, req.user.id);
  }

  @Patch(':id/aprovar')
  aprovar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.aprovar(id, req.user.id); }

  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.cancelar(id, req.user.id); }

  @Patch(':id/arquivar')
  arquivar(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.arquivar(id, req.user.id); }

  @Get('website/integracao')
  integracaoWebsite() { return this.svc.estadoIntegracaoWebsite(); }

  @Post(':id/website/publicar')
  publicarWebsite(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.publicarWebsite(id, req.user.id); }

  @Post(':id/website/remover')
  removerWebsite(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { return this.svc.removerWebsite(id, req.user.id); }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores podem apagar comunicados');
    return this.svc.remove(id, req.user.id);
  }

  @Post(':id/imagem')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('imagem', { limits: { fileSize: MAX_IMAGEM_BYTES } }))
  async uploadImagem(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.svc.update(id, { imagemUrl: await this.gravarImagem(file) }, req.user.id);
  }

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

  private lerXml(file?: Express.Multer.File): string {
    if (!file?.buffer?.length) throw new BadRequestException('Ficheiro XML não enviado');
    if (!/\.xml$/i.test(file.originalname)) throw new BadRequestException('O ficheiro tem de ter extensão .xml');
    return file.buffer.toString('utf-8').replace(/^﻿/, '');
  }

  private async gravarImagem(file?: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Imagem não enviada');
    const tipo = tipoImagem(file.buffer);
    if (!tipo) throw new BadRequestException('Apenas imagens PNG ou JPEG são aceites');
    const chave = `imagens/${randomUUID()}.${tipo === 'png' ? 'png' : 'jpg'}`;
    return this.storage.guardar(chave, file.buffer, tipo === 'png' ? 'image/png' : 'image/jpeg');
  }
}
