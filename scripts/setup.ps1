# IPMA Comunicados Sismológicos — setup inicial
# Executar na raiz do projeto: .\scripts\setup.ps1

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

Write-Host "=== IPMA Sismos — Setup ===" -ForegroundColor Cyan

# 1. Criar .env se não existir
if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host "[OK] .env criado a partir de .env.example" -ForegroundColor Green
    Write-Host "     Edite o .env com as suas credenciais antes de continuar." -ForegroundColor Yellow
    exit 0
}

# 2. Instalar dependências
Write-Host "`n[1/4] Instalando dependências API..." -ForegroundColor Cyan
Set-Location "$root\apps\api"
npm install

Write-Host "`n[2/4] Instalando dependências UI..." -ForegroundColor Cyan
Set-Location "$root\apps\ui"
npm install

# 3. Gerar Prisma client e aplicar schema
Write-Host "`n[3/4] Aplicando schema da base de dados..." -ForegroundColor Cyan
Set-Location "$root\apps\api"
npx prisma db push
npx ts-node prisma/seed.ts

# 4. Instruções finais
Set-Location $root
Write-Host "`n[4/4] Setup concluído!" -ForegroundColor Green
Write-Host @"

Para iniciar em desenvolvimento:
  API:  cd apps/api && npm run start:dev   (porta 3001)
  UI:   cd apps/ui  && npm run dev         (porta 3000)

Para iniciar com Docker:
  docker compose up --build

Credenciais iniciais: as definidas em SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no .env
(em desenvolvimento, sem essas variáveis, o seed usa as credenciais de demonstração indicadas no arranque)

Swagger API: http://localhost:3001/api/docs
"@ -ForegroundColor White
