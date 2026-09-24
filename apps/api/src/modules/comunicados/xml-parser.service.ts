import { Injectable, BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { ListaKey } from '@prisma/client';
import { zoneForArea, wallTimeToUtc } from '../../common/tz.util';

export const AREAS = ['Continente', 'Açores', 'Madeira'] as const;
const LISTAS = Object.values(ListaKey) as string[];
const MAX_XML_BYTES = 256 * 1024;

export interface XmlEventData {
  templateId: string;
  firstPage: boolean;
  active: boolean;
  local: string;
  areaName: string;
  eventDateTime: Date;
  lat: number;
  lon: number;
  depth: number;
  magnitude: number;
  intmax: string;
  regiaoIntmax: string;
  infoMacrossAdicional: string;
  klmLink: string;
  smsKeys: ListaKey[];
  emailKeys: ListaKey[];
  creatingUser: string;
  creatingAuthority: string;
  creationTime: string;
  /** true quando o XML traz informação macrossísmica (formato da atualização manual). */
  temInfoMacrossismica: boolean;
}

@Injectable()
export class XmlParserService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
    htmlEntities: false,
  });

  /**
   * Lê o XML do Centro de Operações (automático ou carregado pelo analista) e valida os campos.
   * Lança BadRequestException com a lista de problemas encontrados.
   */
  parse(xml: string): XmlEventData {
    if (!xml?.trim()) throw new BadRequestException('Ficheiro XML vazio');
    if (Buffer.byteLength(xml, 'utf-8') > MAX_XML_BYTES) throw new BadRequestException('Ficheiro XML demasiado grande');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new BadRequestException('XML com DOCTYPE/ENTITY não é aceite');

    let parsed: any;
    try {
      parsed = this.parser.parse(xml);
    } catch {
      throw new BadRequestException('Ficheiro XML inválido');
    }

    const report = parsed?.report;
    if (!report) throw new BadRequestException('XML sem elemento <report>');
    const event = Array.isArray(report.event) ? report.event[0] : report.event;
    if (!event) throw new BadRequestException('XML sem elemento <event>');

    const txt = (v: unknown) => (v == null ? '' : String(v).trim());
    const num = (v: unknown) => (txt(v) === '' ? NaN : Number(txt(v).replace(',', '.')));
    const erros: string[] = [];

    const areaName = txt(event.areaName) || 'Continente';
    if (!(AREAS as readonly string[]).includes(areaName)) erros.push(`areaName desconhecida: "${areaName}"`);

    const rawDate = txt(event.eventDateTime);
    const eventDateTime = rawDate ? wallTimeToUtc(rawDate, zoneForArea(areaName)) : new Date(NaN);
    if (Number.isNaN(eventDateTime.getTime())) erros.push('eventDateTime em falta ou inválido');

    const lat = num(event.lat), lon = num(event.lon), depth = num(event.depth);
    const magnitude = num(event.magnitud ?? event.magnitude);
    if (!(lat >= -90 && lat <= 90)) erros.push('lat inválida');
    if (!(lon >= -180 && lon <= 180)) erros.push('lon inválida');
    if (!(depth >= 0)) erros.push('depth inválida');
    if (!(magnitude > -3 && magnitude < 11)) erros.push('magnitud inválida');

    const templateId = txt(event['@_templateID']).padStart(4, '0') || '0000';
    if (!/^000[0-7]$/.test(templateId)) erros.push(`templateID desconhecido: "${templateId}"`);

    const smsKeys = this.listas(txt(event.smsKey), 'smsKey', erros);
    const emailKeys = this.listas(txt(event.emailKey), 'emailKey', erros);

    if (erros.length) throw new BadRequestException(`XML inválido: ${erros.join('; ')}`);

    const intmax = txt(event.intmax);
    const regiaoIntmax = txt(event.regiao_intmax);
    const infoMacrossAdicional = txt(event.info_macross_adicional);

    return {
      templateId,
      firstPage: txt(event['@_firstPage']).toLowerCase() === 'true',
      active: txt(event['@_active']).toLowerCase() !== 'false',
      local: txt(event.local),
      areaName,
      eventDateTime,
      lat, lon, depth, magnitude,
      intmax, regiaoIntmax, infoMacrossAdicional,
      klmLink: txt(event.klmLinks),
      smsKeys, emailKeys,
      creatingUser: txt(report['@_creating-user']),
      creatingAuthority: txt(report['@_creating-authority']),
      creationTime: txt(report['@_creation-time']),
      temInfoMacrossismica: !!(intmax || regiaoIntmax || infoMacrossAdicional),
    };
  }

  private listas(valor: string, campo: string, erros: string[]): ListaKey[] {
    if (!valor) return [];
    const keys = valor.split(/[\s,;]+/).filter(Boolean).map(k => k.toUpperCase());
    const invalidas = keys.filter(k => !LISTAS.includes(k));
    if (invalidas.length) erros.push(`${campo} com lista(s) desconhecida(s): ${invalidas.join(', ')}`);
    return [...new Set(keys.filter(k => LISTAS.includes(k)))] as ListaKey[];
  }
}
