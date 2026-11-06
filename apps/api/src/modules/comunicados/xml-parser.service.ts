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
  temInfoMacrossismica: boolean;
}

/***********************************************************************************************************************
* @class         XmlParserService
* @description   Injectable NestJS service that parses and validates the IPMA seismic XML format
*                deposited on the FTP server by the Operations Centre. Used for both the automated
*                polling flow and the manual XML upload flow.
*
* @responsibilities
*                 - Parse XML strings using fast-xml-parser with strict configuration
*                 - Validate all mandatory fields (coordinates, magnitude, datetime, templateId)
*                 - Reject XML with DOCTYPE/ENTITY declarations (XXE protection)
*                 - Convert the wall-clock eventDateTime to UTC using the area's timezone
*                 - Extract dispatch list keys from smsKey and emailKey fields
*
* @lastupdate    30/10/2026
* @company       Atos
* @developer     Rui Ilharco
* @reviewed_by   Rui Ilharco
* @remarks       Architecture notes:
*                 - Validation is accumulative: all errors are collected before throwing.
*                 - Template IDs are zero-padded to 4 digits; only 0000–0007 are valid.
*                 - The XML attribute @_firstPage defaults to true; @_active defaults to true unless explicitly "false".
***********************************************************************************************************************/
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

  /*********************************************************************************************************************
  * @method       parse
  * @description  Parses and validates a raw UTF-8 seismic XML string. Rejects empty input, oversized
  *               files, DOCTYPE/ENTITY declarations, and malformed XML. Accumulates all field errors
  *               and throws a single BadRequestException with the full list.
  * @param        xml — raw UTF-8 XML string from the FTP deposit or manual upload
  * @return       XmlEventData value object with all validated event fields
  * @uses         zoneForArea, wallTimeToUtc, XmlParserService.listas
  *********************************************************************************************************************/
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

  /*********************************************************************************************************************
  * @method       listas
  * @description  Parses a whitespace/comma/semicolon-separated list of dispatch list keys, validates
  *               each against the ListaKey enum, accumulates errors for unknown keys, and returns
  *               the deduplicated set of valid keys.
  * @param        valor — raw string from the smsKey or emailKey XML element
  * @param        campo — field name for error messages ("smsKey" or "emailKey")
  * @param        erros — accumulator array for validation errors
  * @return       Deduplicated array of valid ListaKey values
  *********************************************************************************************************************/
  private listas(valor: string, campo: string, erros: string[]): ListaKey[] {
    if (!valor) return [];
    const keys = valor.split(/[\s,;]+/).filter(Boolean).map(k => k.toUpperCase());
    const invalidas = keys.filter(k => !LISTAS.includes(k));
    if (invalidas.length) erros.push(`${campo} com lista(s) desconhecida(s): ${invalidas.join(', ')}`);
    return [...new Set(keys.filter(k => LISTAS.includes(k)))] as ListaKey[];
  }
}
