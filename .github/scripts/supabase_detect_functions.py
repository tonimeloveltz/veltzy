#!/usr/bin/env python3
"""Job detect do supabase-functions.yml: decide quais functions este push publica.

Adaptado do supabase_detect.py do Hub, sem a parte de migrations (o Veltzy nao aplica
migration). Sem secrets do Supabase. Le BRANCH, SHA, REPO e GH_TOKEN do ambiente e escreve
functions em GITHUB_OUTPUT.

Base do diff: head_sha do ultimo run com sucesso na mesma branch, para um push cancelado
pelo concurrency nao perder function. Sem run anterior, o run so registra a base e nao
publica nada: o primeiro run nao pode redeployar todas em producao.

Diferenca do Hub: a main do Veltzy tambem recebe branches promote/*, entao aqui nao ha a
regra "main so recebe merge da develop".
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import tomllib

FUNCTION = re.compile(r"^supabase/functions/([^/]+)/")
NOME = re.compile(r"^[a-z0-9-]+$")
GLOBAIS = (
    "supabase/config.toml",
    "supabase/functions/deno.json",
    "supabase/functions/import_map.json",
)
WORKFLOW = "supabase-functions.yml"


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=check)


def ultimo_sucesso(repo, branch):
    url = f"repos/{repo}/actions/workflows/{WORKFLOW}/runs?branch={branch}&status=success&event=push&per_page=1"
    saida = subprocess.run(
        ["gh", "api", url, "--jq", '.workflow_runs[0].head_sha // ""'],
        capture_output=True, text=True, check=True,
    )
    return saida.stdout.strip()


def todas_as_functions():
    raiz = pathlib.Path("supabase/functions")
    return sorted(p.name for p in raiz.iterdir() if p.name != "_shared" and (p / "index.ts").is_file())


def validar_config():
    config = tomllib.loads(pathlib.Path("supabase/config.toml").read_text()).get("functions", {})
    existentes = set(todas_as_functions())
    erros = []
    for nome in sorted(existentes - set(config)):
        erros.append(f"{nome}: sem bloco [functions.{nome}] no config.toml")
    for nome in sorted(set(config) - existentes):
        erros.append(f"{nome}: bloco no config.toml sem diretorio em supabase/functions")
    for nome, bloco in sorted(config.items()):
        if not isinstance(bloco.get("verify_jwt"), bool):
            erros.append(f"{nome}: verify_jwt precisa ser explicito no config.toml")
    if erros:
        sys.exit("Config invalido:\n" + "\n".join(erros))


def selecionar(arquivos, resumo):
    if any(a in GLOBAIS or a.startswith("supabase/functions/_shared/") for a in arquivos):
        return todas_as_functions()

    nomes = set()
    for arquivo in arquivos:
        achado = FUNCTION.match(arquivo)
        if not achado or achado.group(1) == "_shared":
            continue
        nome = achado.group(1)
        if not NOME.match(nome):
            sys.exit(f"Nome de function invalido: {nome}")
        if pathlib.Path(f"supabase/functions/{nome}/index.ts").is_file():
            nomes.add(nome)
        else:
            resumo.append(f"Aviso: `{nome}` saiu do repo. Nada foi apagado do projeto.")
    return sorted(nomes)


def main():
    branch, sha, repo = os.environ["BRANCH"], os.environ["SHA"], os.environ["REPO"]
    resumo = []

    validar_config()

    base = ultimo_sucesso(repo, branch)
    if not base:
        functions = []
        resumo.append("Primeiro run nesta branch: registra a base, sem deploy de functions.")
    elif git("merge-base", "--is-ancestor", base, sha, check=False).returncode != 0:
        functions = todas_as_functions()
        resumo.append("A base saiu do historico (force-push): todas as functions.")
    else:
        arquivos = git("diff", "--name-only", base, sha).stdout.split()
        functions = selecionar(arquivos, resumo)

    resumo.append(f"Functions: {', '.join(functions) or 'nenhuma'}")
    print("\n".join(resumo))

    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as saida:
        saida.write(f"functions={json.dumps(functions, separators=(',', ':'))}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as saida:
            saida.write("### Detect\n\n" + "\n\n".join(resumo) + "\n")


if __name__ == "__main__":
    main()
