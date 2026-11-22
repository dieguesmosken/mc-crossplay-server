package dev.mcplatform.plugin.core;

import java.util.Map;

/** Decisão final de admissão que o adaptador aplica no login. */
public record Decision(Verdict verdict, String reason, String message, Origin origin) {

    public enum Verdict {
        ALLOW,
        DENY
    }

    /** De onde veio a decisão (útil para log e para os testes). */
    public enum Origin {
        /** Resposta da API. */
        API,
        /** Operador/whitelist local: liberado sem consultar a API. */
        LOCAL_BYPASS,
        /** API indisponível e política {@code open}. */
        FAIL_OPEN,
        /** API indisponível e política {@code closed}. */
        FAIL_CLOSED,
        /** Plugin sem configuração válida: nega sempre (fail-closed). */
        MISCONFIGURED
    }

    /** Motivos de recusa definidos no contrato. */
    public static final String SERVER_FULL = "SERVER_FULL";

    public static final String IN_QUEUE = "IN_QUEUE";
    public static final String NOT_ALLOWED = "NOT_ALLOWED";
    public static final String API_UNAVAILABLE = "API_UNAVAILABLE";
    public static final String MISCONFIGURED = "MISCONFIGURED";

    /** Mensagens padrão em PT-BR, usadas quando a API não envia uma (iguais às de {@code shared}). */
    public static final Map<String, String> DEFAULT_MESSAGES = Map.of(
            SERVER_FULL, "O servidor está cheio. Entre na fila pelo site e aguarde a sua vez.",
            IN_QUEUE, "Você está na fila. Aguarde ser chamado pelo site e tente conectar quando a vaga for liberada.",
            NOT_ALLOWED, "Você não tem permissão para entrar neste servidor.",
            API_UNAVAILABLE, "O controle de acesso do servidor está indisponível no momento. Tente novamente em instantes.",
            MISCONFIGURED, "O servidor está em manutenção (controle de acesso não configurado). Tente novamente mais tarde.");

    public static Decision allow(Origin origin) {
        return new Decision(Verdict.ALLOW, "", "", origin);
    }

    public static Decision deny(String reason, Origin origin) {
        return new Decision(Verdict.DENY, reason, DEFAULT_MESSAGES.get(reason), origin);
    }

    public static Decision deny(String reason, String message, Origin origin) {
        return new Decision(Verdict.DENY, reason, message, origin);
    }

    public boolean allowed() {
        return verdict == Verdict.ALLOW;
    }
}
