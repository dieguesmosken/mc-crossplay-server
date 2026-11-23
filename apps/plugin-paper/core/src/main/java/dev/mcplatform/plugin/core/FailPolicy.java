package dev.mcplatform.plugin.core;

import java.util.Locale;
import java.util.Optional;

/** O que fazer com jogadores comuns quando a API não responde. */
public enum FailPolicy {
    /** Padrão: nega (operadores e whitelist local continuam liberados). */
    CLOSED,
    /** Libera todo mundo enquanto a API estiver fora. Use só se souber o que está fazendo. */
    OPEN;

    public static Optional<FailPolicy> parse(String value) {
        if (value == null) return Optional.empty();
        return switch (value.strip().toLowerCase(Locale.ROOT)) {
            case "closed" -> Optional.of(CLOSED);
            case "open" -> Optional.of(OPEN);
            default -> Optional.empty();
        };
    }
}
