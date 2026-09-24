# Migração de dados do sistema atual

A migração lê ficheiros CSV exportados da base de dados atual e importa-os para a nova plataforma. O formato é intermédio de propósito: a equipa do IPMA exporta do sistema antigo (SQL, Excel ou script) sem que a nova plataforma precise de conhecer a estrutura interna da aplicação de 2007.

## Como correr

```bash
cd apps/api
npm run migrar -- /caminho/para/exportacao              # simulação: valida e mostra o que seria importado
npm run migrar -- /caminho/para/exportacao --aplicar    # grava
npm run migrar -- /caminho/para/exportacao --aplicar --gerar-pdf   # gera PDF das versões sem PDF original
```

- A simulação é o modo por omissão. Nada é gravado sem `--aplicar`.
- Pode ser repetida: comunicados com referência já existente são ignorados; destinatários já existentes (mesmo email ou telefone) recebem apenas as listas em falta.
- No fim fica um relatório `relatorio-migracao-<data>.json` na pasta, com totais e erros por linha. O código de saída é 1 se houver linhas com erro.
- A numeração anual (Ref.) continua a partir do maior número migrado em cada ano.
- Recomenda-se correr primeiro no ambiente de testes e fazer um backup antes de aplicar em produção.

## Ficheiros

Codificação UTF-8. Separador `;` ou `,` (detetado automaticamente). Campos com separadores ou quebras de linha entre aspas. Os nomes das colunas não distinguem maiúsculas nem acentos. Exemplos em `apps/api/test/fixtures/migracao/`.

### comunicados.csv (obrigatório)

| Coluna | Obrigatória | Formato |
|---|---|---|
| referencia | sim | Referência original, preservada tal como está (máx. 64 caracteres) |
| ano, numero | não* | Ano e número anual. *Se vazios, são extraídos da referência (`SISM-2019-0042`, `042/2019`) |
| template_id | não | `0000`–`0007` (aceita `1`, `3`…). Por omissão `0000` |
| estado | não | rascunho, pendente, aprovado, enviado, cancelado, arquivado. Por omissão `enviado` |
| area | não | Continente, Açores (ou Acores), Madeira. Por omissão Continente |
| local | não | Referência geográfica do epicentro |
| data_evento_utc | não | `2019-03-12T04:21:10Z`, `2019-03-12 04:21:10` ou `12-03-2019 04:21` (tomadas como UTC) |
| lat, lon, profundidade, magnitude | não | Números; aceita vírgula decimal |
| intmax, regiao_intmax, info_macross | não | Texto |
| titulo, texto | sim | Título e texto da última versão |
| primeira_pagina, ativo | não | sim/não, true/false, 1/0 |
| criado_em | não | Data de criação (mesmos formatos) |
| criado_por_email | não | Email do analista; se existir como utilizador fica associado, senão fica "Sistema" |

### versoes.csv (opcional)

Uma linha por versão. Sem este ficheiro cada comunicado fica com uma versão (001) igual ao título e texto de `comunicados.csv`.

| Coluna | Obrigatória | Formato |
|---|---|---|
| referencia | sim | Igual à de comunicados.csv |
| numero | sim | 1, 2, 3… |
| titulo, texto | sim | Conteúdo dessa versão |
| criado_em | não | Data da versão |
| pdf_ficheiro | não | Caminho relativo dentro da pasta (p.ex. `pdfs/SISM-2019-0042_001.pdf`). O PDF original é copiado |

### destinatarios.csv (opcional)

| Coluna | Obrigatória | Formato |
|---|---|---|
| nome | sim | |
| organizacao | não | |
| email, telefone | pelo menos um | Telefone com 9 a 20 dígitos, opcionalmente com `+` |
| listas | sim | LGA, LIA, LGM, LIM, LGC, LIC separadas por `\|`, `,` ou espaço |
| interno | não | sim se for contacto interno do IPMA (recebe envios em modo teste) |
| ativo | não | Por omissão sim |

## RGPD

Os ficheiros de exportação contêm emails e telefones de autoridades públicas. Devem ser transferidos apenas dentro da rede do IPMA e apagados depois da migração validada. O relatório não contém contactos.
