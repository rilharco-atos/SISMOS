/** XML automático (1ª versão) tal como no assessment funcional, secção 4.1. */
export const XML_AUTOMATICO = `<?xml version="1.0" encoding="UTF-8"?>
<report creating-user="Carolina Antunes" creating-authority="Instituto Portugues do Mar e da Atmosfera" creation-time="2026-09-06T10:23:43">
<event templateID="0001" firstPage="false" active="true">
<local>a cerca de 30 km a Sudoeste de Faro</local>
<areaName>Continente</areaName>
<eventDateTime>2026-09-06T11:15:36</eventDateTime>
<lat>36.81</lat>
<lon>-8.16</lon>
<depth>17.50</depth>
<magnitud>2.6</magnitud>
<intmax></intmax>
<regiao_intmax></regiao_intmax>
<info_macross_adicional></info_macross_adicional>
<klmLinks>http://www.ipma.pt/pt/geofisica/comunicados/map.html?output=classic&amp;q=36.812+-8.159&amp;ll=36.812,-8.159</klmLinks>
<smsKey>LIC</smsKey>
<emailKey>LIC</emailKey>
</event>
</report>`;

/** XML carregado pelo analista (2ª versão, substitui o .csv) — assessment secção 4.3. */
export const XML_MANUAL = XML_AUTOMATICO
  .replace('10:23:43', '10:29:41')
  .replace('<event templateID="0001"', '<event templateID="0004"')
  .replace('<intmax></intmax>', '<intmax>III</intmax>')
  .replace('<regiao_intmax></regiao_intmax>', '<regiao_intmax>Albufeira</regiao_intmax>');
