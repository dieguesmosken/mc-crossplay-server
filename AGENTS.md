# AGENTS.md — regras para agentes de desenvolvimento

## Missão

Construir uma plataforma local-first para operar um servidor Minecraft Paper com compatibilidade Bedrock via GeyserMC/Floodgate, controlado por API e apresentado por site com fila de espera.

## Antes de alterar código

1. Leia README.md e os documentos em docs/.
2. Verifique branch, estado do Git e alterações não commitadas.
3. Inspecione a implementação existente antes de substituir arquivos.
4. Consulte documentação oficial das dependências para versões atuais.
5. Faça mudanças pequenas, rastreáveis e reversíveis.

## Restrições fundamentais

- Não apagar, reescrever ou mover o legado sem pedido explícito. O legado está em archive/legacy-python-bedrock-2023.
- Não adicionar credenciais, tokens, senhas, chaves privadas ou arquivos .env reais ao Git.
- Não expor Docker socket, console administrativo ou API de controle à internet.
- Não prometer que o navegador abre o cliente Minecraft universalmente.
- Não confundir a fila lógica do site com fila de pacotes TCP/UDP.
- Não iniciar múltiplas instâncias de mundo para atender à fila: o escopo inicial é uma instância.
- Não remover volumes, mundos, backups ou dados persistentes em scripts de limpeza.
- Não instalar Docker Engine duplicado dentro do WSL enquanto Docker Desktop estiver integrado.
- Não adicionar Redis, Kubernetes ou serviços extras sem necessidade demonstrada.
- Não declarar tarefa concluída sem executar testes relevantes e relatar os que não puderam ser executados.

## Diretrizes técnicas

- Preferir TypeScript para aplicações Node.js.
- Separar frontend, API, controller, persistência e integração Minecraft.
- Manter a camada de servidor independente do provedor de hospedagem.
- Persistir fila/reservas em SQLite inicialmente; projetar migração futura para PostgreSQL.
- Usar Docker Compose para serviços containerizados.
- Persistir mundo, plugins, configurações e backups em volumes.
- Java usa TCP; Bedrock usa UDP. Documentar portas e firewall.
- Confirmar prontidão real do Minecraft, não apenas existência do processo Java.
- Usar timeouts, idempotência e limites contra spam em pedidos de inicialização.
- Tornar tempos de desligamento configuráveis; ainda não foram aprovados.

## Qualidade

- Adicionar testes unitários e de integração.
- Executar lint, typecheck, testes e build aplicáveis.
- Não mascarar falhas com testes ignorados ou comandos que sempre retornam sucesso.
- Atualizar documentação e exemplos junto com mudanças funcionais.
- Fixar versões no lockfile.

## Forma de trabalhar

1. Resuma objetivo e arquivos que pretende alterar.
2. Implemente somente o escopo solicitado.
3. Execute verificações.
4. Informe arquivos alterados, comandos e resultados.
5. Não faça deploy, exclusões remotas ou mudanças destrutivas sem autorização explícita.

## Relatórios e Auditoria (ChatGPT)

- Toda atualização em `ChatGPT.md` deve conter um timestamp no fuso `America/Sao_Paulo` (formato: `2026-11-18T06:50:00-03:00 [America/Sao_Paulo]`).
- Registre commits, arquivos criados/alterados e resultados de testes.
- A auditoria é independente; verifique commits e diffs antes de registrar conclusão.

## Interfaces Futuras

- **Site Público:** Protótipo visual (Dark tecnológico: preto, azul, verde). Status, conexão, novidades.
- **Dashboard de Desenvolvimento:** Independente do site público. Acompanha roadmap, progresso, atividades e resultados de testes via `project-status.json`.
- **Execução:** Manter prioridade na Fase 1 (Runtime) antes de iniciar interfaces.

## Ideias Pausadas

- **IA Colaborativa:** Estudo para múltiplos modelos atuando em paralelo (pausado).

## Critérios de conclusão

Comportamento implementado, testes relevantes aprovados (ou limitações explicitadas), documentação atualizada e nenhum dado sensível no diff.
