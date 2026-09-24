# Operação da plataforma SISMOS

## Ambientes

| | Produção | Testes |
|---|---|---|
| Arranque | `docker compose up -d --build` | `docker compose -f docker-compose.test.yml --env-file .env.test up -d --build` |
| Portas | UI 3000 · API 3001 | UI 3100 · API 3101 |
| Envios | Modo definido no backoffice | Sempre modo teste: só recebem os destinatários marcados como "Contacto interno IPMA"; assunto com `[TESTE]` |
| Website | Publica se `WEBSITE_PUBLISHER` estiver configurado | Nunca publica |
| FTP | Pasta de produção | Pasta própria (`/sismos-teste/incoming`) |

Os dois ambientes têm bases de dados, volumes e backups separados. No ambiente de testes a interface mostra uma faixa laranja permanente.

## Monitorização

- **Health**: `GET /api/system/health` (sem autenticação). Devolve `status` `ok`, `degraded` ou `down` e o estado de cada componente (`ftp`, `envio`, `website`, `backup`). HTTP 503 apenas quando a base de dados está indisponível. É o endpoint usado pelo healthcheck do Docker.
- **Detalhe**: Backoffice › Configurações › Saúde do Sistema (ou `GET /api/system/saude`, administradores), com mensagens de erro e último sucesso.
- **Métricas Prometheus**: `GET /api/metrics`. Com `METRICS_TOKEN` definido exige `Authorization: Bearer <token>`. Principais séries:
  - `sismos_envios_total{canal,resultado}` — mensagens email/SMS ok e falhadas
  - `sismos_xml_processados_total{resultado}` — XML importados, rejeitados, com erro
  - `sismos_ftp_ultimo_poll_sucesso_timestamp_seconds` — deve avançar a cada intervalo de polling
  - `sismos_comunicados_criados_total{origem}`, `sismos_website_operacoes_total`, `sismos_http_requests_total`
- **Logs**: JSON numa linha por evento em stdout/stderr (`docker compose logs api`), com `requestId` em cada pedido. Um envio com falhas gera um evento `"msg":"ALERTA: envio com falhas"` de nível `error`.

Alertas recomendados (Prometheus/Grafana ou equivalente do IPMA):

| Alerta | Expressão sugerida |
|---|---|
| Falhas de envio | `increase(sismos_envios_total{resultado="falha"}[15m]) > 0` |
| FTP parado | `time() - sismos_ftp_ultimo_poll_sucesso_timestamp_seconds > 300` |
| XML rejeitados | `increase(sismos_xml_processados_total{resultado="rejeitado"}[1h]) > 0` |
| Plataforma degradada | health `status != "ok"` durante 10 min |

## Backups

O serviço `backup` do docker-compose faz, a cada `BACKUP_INTERVALO_HORAS` (6 h por omissão):

- dump da base de dados (`sismos_<data>.dump`, formato custom do PostgreSQL, verificado com `pg_restore --list` antes de ser aceite);
- arquivo dos PDFs e imagens (`uploads_<data>.tar.gz`);
- remoção dos ficheiros com mais de `BACKUP_RETENCAO_DIAS` (30).

Os ficheiros ficam no volume `backups`. **Esse volume tem de ser copiado para fora do servidor** (NAS ou sistema de backup do IPMA), senão uma falha do disco leva os dados e os backups. O health fica `degraded` se o último backup tiver mais de `BACKUP_MAX_IDADE_HORAS` (26).

Backup imediato:

```bash
docker compose run --rm -e BACKUP_UMA_VEZ=1 backup
```

### Reposição

```bash
docker compose run --rm backup /scripts/restore.sh                                   # lista os backups
docker compose run --rm backup /scripts/restore.sh sismos_20260924_120000.dump       # simulação
docker compose stop api
docker compose run --rm backup /scripts/restore.sh sismos_20260924_120000.dump --confirmo
docker compose start api
```

A reposição faz primeiro um backup de segurança do estado atual e repõe também os ficheiros se existir o `uploads_` com o mesmo carimbo. Recomenda-se testar a reposição no ambiente de testes pelo menos uma vez por trimestre.

## Integração com o website

Por confirmar com a equipa do website (pergunta 7 do assessment). A plataforma já publica ao enviar, retira ao cancelar/arquivar/desativar e regista o estado em cada comunicado (Publicado, Retirado, Erro), com botão para repetir. Uma falha do website não impede o envio de email e SMS. Duas formas suportadas, escolhidas por `WEBSITE_PUBLISHER`:

- `http`: `PUT {IPMA_WEBSITE_API_URL}/comunicados/{referencia}` com o JSON abaixo e `DELETE` para retirar; `Authorization: Bearer {IPMA_WEBSITE_API_TOKEN}` se definido.
- `ficheiro`: escreve `{referencia}.json` e o índice `comunicados.json` (ativos, mais recente primeiro) numa pasta partilhada lida pelo website.

```json
{
  "referencia": "SISM-2026-0001", "versao": 2, "titulo": "…", "texto": "…",
  "primeiraPagina": true, "ativo": true, "area": "Continente",
  "visivelDe": "2026-09-24T10:00:00.000Z", "visivelAte": "2026-09-25T10:00:00.000Z",
  "evento": { "dataHoraUtc": "…", "local": "…", "magnitude": 2.6, "latitude": 36.81, "longitude": -8.16, "profundidadeKm": 17.5, "intensidadeMaxima": "III" },
  "publicadoEm": "2026-09-24T10:05:00.000Z"
}
```

Se o website precisar de outro protocolo, acrescenta-se uma implementação de `WebsitePublisher` em `apps/api/src/modules/website/publishers.ts` sem alterar o resto da aplicação.
