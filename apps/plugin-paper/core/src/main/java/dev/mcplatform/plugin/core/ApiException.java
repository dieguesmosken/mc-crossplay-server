package dev.mcplatform.plugin.core;

/** Falha ao falar com a API. Nunca carrega o segredo nem o corpo assinado. */
public class ApiException extends Exception {
    private static final long serialVersionUID = 1L;

    public enum Kind {
        /** Rede, timeout ou erro 5xx: a API pode voltar. */
        UNAVAILABLE,
        /** 4xx (inclusive 401 de assinatura inválida): quase sempre configuração errada. */
        REJECTED,
        /** A API respondeu 200 com um corpo fora do contrato. */
        INVALID_RESPONSE
    }

    private final Kind kind;

    public ApiException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public ApiException(Kind kind, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
