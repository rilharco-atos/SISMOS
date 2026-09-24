#!/bin/sh
# Backup periódico da base de dados e dos ficheiros (PDFs, imagens) da plataforma SISMOS.
# Corre no serviço "backup" do docker-compose. Variáveis:
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD  ligação ao PostgreSQL
#   BACKUP_INTERVALO_HORAS (6)              intervalo entre backups
#   BACKUP_RETENCAO_DIAS   (30)             ficheiros mais antigos são apagados
#   BACKUP_UMA_VEZ=1                        faz um backup e termina (uso manual)
set -eu

DESTINO=/backups
UPLOADS=/uploads
INTERVALO=$(( ${BACKUP_INTERVALO_HORAS:-6} * 3600 ))
RETENCAO=${BACKUP_RETENCAO_DIAS:-30}

log() { printf '{"ts":"%s","service":"sismos-backup","level":"%s","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"; }

fazer_backup() {
  carimbo=$(date -u +%Y%m%d_%H%M%S)
  tmp="$DESTINO/.sismos_${carimbo}.dump.tmp"
  if pg_dump --format=custom --compress=9 --no-owner --file="$tmp"; then
    # Verifica que o dump é legível antes de o dar como válido.
    if pg_restore --list "$tmp" > /dev/null 2>&1; then
      mv "$tmp" "$DESTINO/sismos_${carimbo}.dump"
      log info "backup base de dados concluido: sismos_${carimbo}.dump ($(du -h "$DESTINO/sismos_${carimbo}.dump" | cut -f1))"
    else
      rm -f "$tmp"
      log error "dump invalido descartado: sismos_${carimbo}"
      return 1
    fi
  else
    rm -f "$tmp"
    log error "pg_dump falhou"
    return 1
  fi

  if [ -d "$UPLOADS" ]; then
    tar -czf "$DESTINO/uploads_${carimbo}.tar.gz" -C "$UPLOADS" . && log info "backup ficheiros concluido: uploads_${carimbo}.tar.gz"
  fi

  find "$DESTINO" -maxdepth 1 \( -name 'sismos_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$RETENCAO" -print -delete \
    | while read -r f; do log info "removido por retencao: $(basename "$f")"; done
}

mkdir -p "$DESTINO"
until pg_isready -q; do log warn "a aguardar PostgreSQL"; sleep 5; done

if [ "${BACKUP_UMA_VEZ:-0}" = "1" ]; then
  fazer_backup
  exit $?
fi

log info "servico de backup iniciado (intervalo ${BACKUP_INTERVALO_HORAS:-6}h, retencao ${RETENCAO} dias)"
while true; do
  fazer_backup || log error "backup falhou; nova tentativa no proximo ciclo"
  sleep "$INTERVALO"
done
