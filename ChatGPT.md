3. **Limitações e Passos Futuros**
**Status Atual (2026-11-18):**
- Fase 1 (Runtime Minecraft) concluída: Dockerfile, docker-compose.yml e documentação de infraestrutura implementados e commitados.
- Servidor Paper 1.20.1 configurado com GeyserMC e Floodgate em volumes persistentes.

**Limitações:**

1. **Visibilidade Interna:** Sem acesso ao código-fonte ou logs do FreeLLMAPI, não é possível mapear o modelo de IA selecionado (Fable, Opus, Sonnet, etc.) efetivamente utilizado para cada solicitação.

2. **Configuração de Atribuição:** O Claude Code usa uma linha "Co‑Authored‑By: Claude Code <noreply@anthropic.com>" fixa no final de cada commit. A "AGENTS.md" do projeto exige que cada commit documente o "autores e identificador do modelo de IA selecionado", mas esta linha fixa não atende a essa regra.

3. **Dinâmica de Autores:** Atualmente, a atribuição de autoria é única: o Commit‑Author (quem executa `git commit`) é o único autor visível, enquanto o "Co‑Authored‑By" é anônimo e estaticamente definido.

**Passos Futuros Sugeridos**

1. **Logging Personalizado:** Implementar um logger de CLI baseado no FreeLLMAPI que capture:
   - The commit Author (nome/email do usuário)
   - Modelo de IA escolhido efetivamente
   - Modelo do Claude Code utilizado como interface
   - Timestamp e ID da sessão
   Salvar essa captura em um arquivo oculto (ex: `.claude/commit_attribution.jsonl`) e anexar essa referência ao commit (ex: através do `git commit --message "Co‑Authored‑By: Claude Code <noreply@anthropic.com> ..."`).

2. **Hook Git Customizado:** Usar um `post-commit` hook que grava um resumo estruturado em `.git/COMMIT_ATTRIBUTION`. O hook seria executado após cada commit do Claude Code, lendo automaticamente de um arquivo de log do FreeLLMAPI (se disponível) e escrevendo uma representação JSON simples:
   {
     "author": "Matheus Mosken Diegues <dmosken2015@gmail.com>",
     "ai_router": "FreeLLMAPI",
     "ai_model": "<model‑id>",
     "ai_interface": "Claude Code",
     "commit_hash": "<sha>",
     "commit_message": "<mensagem original>"
   }

3. **Atribuição Condicional:** Adicionar um prefixo condicional para commits gerados via FreeLLMAPI (ex: "[AI-Router] ..." na mensagem). Isso pode ser aplicado por meio de um trigger no CLI: se o usuário definir `CLD_AI_MODE=true`, a mensagem inclui marcadores padronizados.

4. **Sincronização da Interface de Usuário:** Fornecer uma interface (`/config` comando) para permitir que o usuário defina:
   - Autor padrão (caso o mesmo usuário esteja commitando via vários sistemas)
   - ID do modelo preferido (caso o usuário queira sobrescrever a seleção do FreeLLMAPI)
   - Formato de attribution (ex: manter/Co‑Authored‑By + JSON adicional)

5. **Planejamento do FreeLLMAPI:** Coordenar com a equipe responsável pelo roteamento do FreeLLMAPI para expor um endpoint que registra cada commit em um formato estruturado (mesmo formato JSON), ajudando a rastrear a atribuição em tempo real.

**Próximos Passos** (para o sprint atual)

- A equipe do Claude Code deve adicionar um campo `attribution_metadata` ao `git-commit` hook.
- A ferramenta FreeLLMAPI deve adicionar um logger que escreva eventos em um arquivo de log portátil.
- Projeto deve decidir sobre o esquema de log preferido: JSON vs linha simples.
- As configurações .claude/.claude.json devem adicionar opções para tags de attribution e autores personalizados.

**Conclusão:** Sem essas extensões, attribution de commits permanece estática e anônima para contribuições geradas por IA. Uma adoção significativa de GitHub Actions/GitOps pode dificultar a avaliação do contributo real (quem gerou o commit através do FreeLLMAPI). A adição de log e hooks personalizados é um pré-requisito para um pipeline de desenvolvimento responsável.

---

*Este documento será mantido como canal de comunicação oficial entre a equipe de desenvolvimento e o modelo ChatGPT.*
