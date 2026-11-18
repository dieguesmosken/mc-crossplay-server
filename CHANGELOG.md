# Changelog

## Unreleased

- Corrigir mounts de volumes no `docker-compose.yml` para não ocultar `paper.jar`, EULA e plugins.
- Definir combinação compatível de Paper, Geyser, Floodgate e Java (consultar fontes oficiais).
- Validar URL de download do Paper no Dockerfile.
- Documentação completa do runtime em `infrastructure/minecraft/README.md` e `infrastructure/docker/README.md`.
- Roadmap atualizado refletindo implementação real da Fase 1.
- ChatGPT.md atualizado com relatório de implementação, testes e limitações.
- .gitignore: adicionada apenas `.claude/INSTRUCOES-ATUAIS.md` (não todo o diretório `.claude/`).
- Validar startup real do runtime (Java e Bedrock) com evidências.
- Testar conexão Java (TCP 25565) com cliente Minecraft Java Edition.
- Testar conexão Bedrock (UDP 19132) com cliente Minecraft Bedrock.
- Validar `server.properties` e geração de mundo.

---

*O histórico de versões antigas (0.0.1, 0.0.2 de 2023) pertence ao projeto Python legado e foi preservado na branch `main` como backup. Esta branch contém apenas o histórico da nova plataforma Minecraft Crossplay Server.*