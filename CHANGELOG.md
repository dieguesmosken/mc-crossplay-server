# Changelog

## Unreleased

- [ ] Validar startup real do runtime (Java e Bedrock) com evidências.
- [ ] Testar conexão Java (TCP 25565) com cliente Minecraft Java Edition.
- [ ] Testar conexão Bedrock (UDP 19132) com cliente Minecraft Bedrock.
- [ ] Validar `server.properties` e geração de mundo.

---

### [0.0.1] - 2026-11-18T19:10:12-03:00 [America/Sao_Paulo]

#### Added
- Dockerfile para PaperMC 26.3 (build 255) com Java 25 (eclipse-temurin:25-jdk-alpine).
- Entrypoint.sh com download condicional de GeyserMC e Floodgate (Spigot/Paper latest) e validação de EULA.
- Docker Compose com serviço `papermc`, volumes redesenhados (não ocultam paper.jar nem plugins da imagem), portas em loopback (127.0.0.1:25565/tcp e 127.0.0.1:19132/udp), mem_limit 2g, rede bridge.
- Persistência de mundo, plugins, configs, logs e EULA em `./data/`.
- Documentação completa em `infrastructure/minecraft/README.md` e `infrastructure/docker/README.md`.
- Roadmap atualizado refletindo implementação real da Fase 1.
- ChatGPT.md atualizado com relatório de implementação, testes e limitações.

#### Changed
- Removido atributo obsoleto `version: "3.8"` do docker-compose.yml.
- Volumes reconfigurados para bind mounts separados: `./data/world`, `./data/plugins`, `./data/config`, `./data/config/eula.txt:/server/eula.txt`, `./data/logs`.
- EULA NÃO aceita automaticamente — arquivo `./data/config/eula.txt` inicializado com `eula=false`, montado em `/server/eula.txt`.
- README.md atualizado para refletir estado atual do runtime.

#### Fixed
- .gitignore: adicionada apenas `.claude/INSTRUCOES-ATUAIS.md` (não todo o diretório `.claude/`).

#### Known Limitations
- EULA não aceita — requer ação manual do usuário (`echo 'eula=true' > infrastructure/docker/data/config/eula.txt` após ler a EULA oficial).
- Startup real não validado — container não inicia enquanto `eula.txt` não for `eula=true`.
- Conexões Java (TCP 25565) e Bedrock (UDP 19132) não testadas — requerem clientes Minecraft reais.
- `server.properties` e geração de mundo pendentes de validação.

#### Testes Executados
- `docker compose config` — sintaxe válida, sem warnings.
- `docker compose build` — build bem-sucedido, Paper 26.3 (~55 MB) baixado de `fill-data.papermc.io`, imagem `docker-papermc:latest` criada.

#### Como Reproduzir
```bash
# Construir a imagem
docker compose -f infrastructure/docker/docker-compose.yml build

# Aceitar EULA (após ler em https://www.microsoft.com/en-us/licensing/faq/minecraft)
echo 'eula=true' > infrastructure/docker/data/config/eula.txt

# Iniciar o runtime
docker compose -f infrastructure/docker/docker-compose.yml up
```

#### Commit
`6a41bbe` (hash completo a ser preenchido após commit)

---

*O histórico de versões antigas (0.0.1, 0.0.2 de 2023) pertence ao projeto Python legado e foi preservado na branch `main` como backup. Esta branch contém apenas o histórico da nova plataforma Minecraft Crossplay Server.*