#!/usr/bin/env python3
"""
IPMA Comunicados Sismológicos — Script de arranque local.

Arranca tudo o que é preciso para ter a plataforma em http://localhost:3000:

  1. Docker Desktop (arranca-o se estiver parado)
  2. Container PostgreSQL
  3. Schema Prisma + seed (admin inicial)
  4. API NestJS no porto 3001
  5. UI Next.js no porto 3000

Uso:
    py scripts/start-local.py                     # arranque normal
    py scripts/start-local.py --no-browser        # sem abrir browser
    py scripts/start-local.py --infra-only        # só o container postgres
    py scripts/start-local.py --reset-db          # apaga volumes e recomeça
    py scripts/start-local.py --skip-install      # salta o npm install
    py scripts/start-local.py --docker            # tudo via Docker Compose
    py scripts/start-local.py --stop              # pára os containers
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths e constantes
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
API_DIR      = PROJECT_ROOT / "apps" / "api"
UI_DIR       = PROJECT_ROOT / "apps" / "ui"

IS_WINDOWS          = platform.system() == "Windows"
DOCKER_DESKTOP_WIN  = Path(r"C:\Program Files\Docker\Docker\Docker Desktop.exe")
_CMD_EXT            = ".cmd" if IS_WINDOWS else ""

API_PORT = 3001
UI_PORT  = 3000

COMPOSE_ENV = {
    "POSTGRES_PASSWORD": "sismos_dev_pwd",
}

# ---------------------------------------------------------------------------
# Helpers de output
# ---------------------------------------------------------------------------

def _init_output() -> bool:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    try:
        "✓⚠✗╔═╗".encode(sys.stdout.encoding or "ascii")
        return True
    except (UnicodeEncodeError, LookupError):
        return False


UNICODE_OK = _init_output()
SYM_OK   = "✓" if UNICODE_OK else "OK"
SYM_WARN = "⚠" if UNICODE_OK else "!"
SYM_ERR  = "✗" if UNICODE_OK else "X"
BOX      = "╔╗╚╝═║" if UNICODE_OK else "++++-|"


def cprint(colour: str, msg: str) -> None:
    codes = {
        "green":  "\033[92m", "yellow": "\033[93m",
        "red":    "\033[91m", "blue":   "\033[94m",
        "cyan":   "\033[96m", "gray":   "\033[90m",
        "reset":  "\033[0m",  "bold":   "\033[1m",
    }
    if sys.stdout.isatty():
        print(f"{codes.get(colour, '')}{msg}{codes['reset']}", flush=True)
    else:
        print(msg, flush=True)


def box(title: str, lines: list[str]) -> None:
    tl, tr, bl, br, h, v = BOX
    inner = max([len(title)] + [len(x) for x in lines]) + 4
    cprint("bold", tl + h * inner + tr)
    cprint("bold", f"{v} {title.center(inner - 2)} {v}")
    if lines:
        cprint("bold", v + h * inner + v)
    for line in lines:
        cprint("bold", f"{v} {line.ljust(inner - 2)} {v}")
    cprint("bold", bl + h * inner + br)


def fail(msg: str, hint: str = "") -> None:
    cprint("red", f"\n  {SYM_ERR} {msg}")
    for line in hint.splitlines():
        if line.strip():
            cprint("yellow", f"    {line}")
    sys.exit(1)


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def compose_env() -> dict:
    return {**os.environ, **COMPOSE_ENV}


# ---------------------------------------------------------------------------
# 1. Docker
# ---------------------------------------------------------------------------

def docker_alive() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        return run(["docker", "info", "--format", "{{.ServerVersion}}"]).returncode == 0
    except (FileNotFoundError, OSError):
        return False


def ensure_docker() -> None:
    if not shutil.which("docker"):
        fail("docker não está no PATH.", "Instalar Docker Desktop.")

    if docker_alive():
        cprint("green", f"  {SYM_OK} Docker a responder")
        return

    if not (IS_WINDOWS and DOCKER_DESKTOP_WIN.exists()):
        fail("o daemon do Docker não responde.", "Arrancar o Docker e repetir.")

    cprint("yellow", f"  {SYM_WARN} Docker parado — a arrancar o Docker Desktop (~1-2 min)")
    subprocess.Popen([str(DOCKER_DESKTOP_WIN)], creationflags=subprocess.DETACHED_PROCESS)

    for i in range(60):
        time.sleep(4)
        if docker_alive():
            cprint("green", f"  {SYM_OK} Docker a responder")
            return
        if (i + 1) % 5 == 0:
            print(f"  Aguardar Docker... ({(i + 1) * 4}s)")
    fail("o Docker Desktop não ficou pronto em 4 minutos.")


def container_state(service: str) -> str:
    cid = run(["docker", "compose", "ps", "-q", service],
              cwd=PROJECT_ROOT, env=compose_env()).stdout.strip().splitlines()
    if not cid:
        return "missing"
    res = run(["docker", "inspect", "--format",
               "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", cid[0]])
    return res.stdout.strip() if res.returncode == 0 else "missing"


def start_postgres(reset_db: bool) -> None:
    if reset_db:
        cprint("yellow", f"  {SYM_WARN} --reset-db: a parar containers e apagar volumes")
        subprocess.run(["docker", "compose", "down", "-v"],
                       cwd=PROJECT_ROOT, env=compose_env())
        cprint("green", f"  {SYM_OK} Volumes apagados")

    res = subprocess.run(["docker", "compose", "up", "-d", "postgres"],
                         cwd=PROJECT_ROOT, env=compose_env())
    if res.returncode != 0:
        fail("`docker compose up postgres` falhou (ver output acima).")

    for i in range(30):
        state = container_state("postgres")
        if state == "healthy":
            cprint("green", f"  {SYM_OK} PostgreSQL pronto")
            return
        if state in ("exited", "unhealthy"):
            fail("o container postgres ficou em estado '%s'." % state,
                 "docker compose logs postgres")
        time.sleep(3)
        if (i + 1) % 5 == 0:
            print(f"  Aguardar PostgreSQL... ({(i + 1) * 3}s)")

    fail("timeout à espera do PostgreSQL.", "docker compose logs postgres")


def stop_containers() -> None:
    subprocess.run(["docker", "compose", "stop"], cwd=PROJECT_ROOT, env=compose_env())
    cprint("green", f"  {SYM_OK} Containers parados (volumes preservados)")


# ---------------------------------------------------------------------------
# 2. Node / npm
# ---------------------------------------------------------------------------

def ensure_node() -> None:
    if not shutil.which("node"):
        fail("node não está no PATH.", "Instalar Node.js 20+  https://nodejs.org")
    ver = run(["node", "--version"]).stdout.strip()
    cprint("green", f"  {SYM_OK} Node.js {ver}")


def install_npm(name: str, directory: Path) -> None:
    if (directory / "node_modules").exists():
        cprint("green", f"  {SYM_OK} {name} — node_modules já existe, a saltar")
        return
    cprint("yellow", f"  {SYM_WARN} {name} — a correr npm install...")
    res = subprocess.run(
        ["npm" + _CMD_EXT, "install", "--prefer-offline"],
        cwd=directory, capture_output=False,
    )
    if res.returncode != 0:
        fail(f"npm install falhou na {name}.")
    cprint("green", f"  {SYM_OK} {name} — dependências instaladas")


# ---------------------------------------------------------------------------
# 3. .env
# ---------------------------------------------------------------------------

def _parse_dotenv(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            result[key] = val
    except OSError:
        pass
    return result


def ensure_env() -> None:
    env_path     = PROJECT_ROOT / ".env"
    example_path = PROJECT_ROOT / ".env.example"
    if not env_path.exists():
        if example_path.exists():
            shutil.copy(example_path, env_path)
            cprint("yellow", f"  {SYM_WARN} .env criado a partir de .env.example — reveja antes de continuar")
        else:
            fail(".env e .env.example não encontrados.")
    else:
        cprint("green", f"  {SYM_OK} .env encontrado")

    # carrega as variáveis do .env — sobrepõe o sistema para garantir consistência
    for k, v in _parse_dotenv(env_path).items():
        os.environ[k] = v


# ---------------------------------------------------------------------------
# 4. Prisma
# ---------------------------------------------------------------------------

def setup_prisma(reset_db: bool) -> None:
    npx = "npx" + _CMD_EXT
    # env explícito: .env sobrepõe o sistema, evita DATABASE_URL antiga na sessão
    env = {**os.environ, **_parse_dotenv(PROJECT_ROOT / ".env")}
    db_url = env.get("DATABASE_URL", "<não definido>")
    cprint("gray", f"  DATABASE_URL: {db_url}")

    cmd = [npx, "prisma", "db", "push"] + (["--force-reset"] if reset_db else [])
    res = subprocess.run(cmd, cwd=API_DIR, env=env)
    if res.returncode != 0:
        fail("prisma db push falhou.", "Verificar DATABASE_URL no .env")
    cprint("green", f"  {SYM_OK} Schema aplicado")

    cprint("yellow", f"  {SYM_WARN} A correr seed...")
    res = subprocess.run([npx, "ts-node", "prisma/seed.ts"], cwd=API_DIR, env=env)
    if res.returncode != 0:
        fail("seed falhou.", "npx ts-node apps/api/prisma/seed.ts")
    cprint("green", f"  {SYM_OK} Seed concluído  (rui.ilharco.external@atos.ai / secret123)")


# ---------------------------------------------------------------------------
# 5. Streaming de output dos processos
# ---------------------------------------------------------------------------

def stream(proc: subprocess.Popen, prefix: str, colour: str) -> None:
    codes = {
        "blue":  "\033[94m", "green": "\033[92m",
        "reset": "\033[0m",  "bold":  "\033[1m", "gray": "\033[90m",
    }
    b = codes.get("bold", "")
    c = codes.get(colour, "")
    r = codes.get("reset", "")
    g = codes.get("gray", "")
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            if sys.stdout.isatty():
                print(f"{c}{b}[{prefix}]{r} {g}{line}{r}", flush=True)
            else:
                print(f"[{prefix}] {line}", flush=True)


# ---------------------------------------------------------------------------
# 6. Aguardar a API estar pronta
# ---------------------------------------------------------------------------

def announce_when_ready(open_browser: bool) -> None:
    health_url = f"http://localhost:{API_PORT}/api/system/health"
    for _ in range(84):          # ~7 min
        time.sleep(5)
        try:
            with urllib.request.urlopen(health_url, timeout=3) as r:
                if r.status == 200:
                    break
        except (urllib.error.URLError, OSError, TimeoutError):
            continue
    else:
        cprint("yellow", f"\n  {SYM_WARN} A API não ficou pronta em 7 min — ver output acima.")
        return

    print()
    box("IPMA Sismos - Plataforma pronta", [
        f"UI        ->  http://localhost:{UI_PORT}",
        f"API       ->  http://localhost:{API_PORT}/api",
        f"Swagger   ->  http://localhost:{API_PORT}/api/docs",
        "",
        "Login:  rui.ilharco.external@atos.ai",
        "Pass:   secret123",
        "",
        "Ctrl+C para parar tudo.",
    ])
    print()

    if open_browser:
        try:
            webbrowser.open(f"http://localhost:{UI_PORT}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 7. Arrancar API + UI
# ---------------------------------------------------------------------------

def start_dev(open_browser: bool) -> None:
    for name, port in [("API", API_PORT), ("UI", UI_PORT)]:
        if port_in_use("127.0.0.1", port):
            fail(f"a porta {port} ({name}) já está ocupada.",
                 f"Libertar a porta e repetir.")

    npm = "npm" + _CMD_EXT
    api_proc = subprocess.Popen(
        [npm, "run", "start:dev"], cwd=API_DIR,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    ui_proc = subprocess.Popen(
        [npm, "run", "dev"], cwd=UI_DIR,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )

    threading.Thread(target=stream, args=(api_proc, "API", "blue"),  daemon=True).start()
    threading.Thread(target=stream, args=(ui_proc,  "UI",  "green"), daemon=True).start()
    threading.Thread(target=announce_when_ready, args=(open_browser,), daemon=True).start()

    try:
        api_proc.wait()
    except KeyboardInterrupt:
        cprint("yellow", "\n  A parar serviços...")
        for p in (api_proc, ui_proc):
            try:
                p.terminate()
            except Exception:
                pass
        time.sleep(1)
        for p in (api_proc, ui_proc):
            try:
                p.kill()
            except Exception:
                pass
        cprint("green", f"  {SYM_OK} Serviços parados. Containers continuam activos (--stop para parar).")


# ---------------------------------------------------------------------------
# 8. Modo Docker Compose completo
# ---------------------------------------------------------------------------

def start_docker_compose() -> None:
    cprint("yellow", f"  {SYM_WARN} docker compose up --build  (Ctrl+C para parar)")
    try:
        proc = subprocess.Popen(
            ["docker", "compose", "up", "--build"],
            cwd=PROJECT_ROOT, env=compose_env(),
        )
        proc.wait()
    except KeyboardInterrupt:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="IPMA Sismos — arranque local")
    parser.add_argument("--no-browser",    action="store_true", help="Não abrir browser")
    parser.add_argument("--infra-only",    action="store_true", help="Só o container PostgreSQL")
    parser.add_argument("--reset-db",      action="store_true", help="Apagar volumes antes de arrancar")
    parser.add_argument("--skip-install",  action="store_true", help="Saltar npm install")
    parser.add_argument("--skip-db",       action="store_true", help="Saltar prisma push e seed")
    parser.add_argument("--docker",        action="store_true", help="Tudo via Docker Compose (produção local)")
    parser.add_argument("--stop",          action="store_true", help="Parar containers e sair")
    args = parser.parse_args()

    print()
    box("IPMA Comunicados Sismologicos - Arranque Local", [])

    # ── parar ─────────────────────────────────────────────────────────────
    if args.stop:
        print("\n[1/1] A parar containers...")
        ensure_docker()
        stop_containers()
        return 0

    # ── modo Docker Compose completo ──────────────────────────────────────
    if args.docker:
        print("\n[1/2] Docker...")
        ensure_docker()
        print("\n[2/2] A arrancar stack completo...")
        start_docker_compose()
        return 0

    # ── modo dev (processos directos) ─────────────────────────────────────
    print("\n[1/5] Verificacoes...")
    ensure_env()
    ensure_node()
    ensure_docker()

    print("\n[2/5] PostgreSQL...")
    start_postgres(reset_db=args.reset_db)

    if not args.skip_install:
        print("\n[3/5] Dependencias npm...")
        install_npm("API", API_DIR)
        install_npm("UI",  UI_DIR)
    else:
        cprint("yellow", f"\n[3/5] {SYM_WARN} npm install saltado (--skip-install)")

    if not args.skip_db:
        print("\n[4/5] Base de dados (Prisma)...")
        setup_prisma(reset_db=args.reset_db)
    else:
        cprint("yellow", f"\n[4/5] {SYM_WARN} Prisma saltado (--skip-db)")

    if args.infra_only:
        print()
        cprint("green", f"  {SYM_OK} Infraestrutura pronta.")
        print("    Backend:  py scripts/start-local.py --skip-install --skip-db")
        return 0

    print("\n[5/5] API + UI...")
    start_dev(open_browser=not args.no_browser)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
