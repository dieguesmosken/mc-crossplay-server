package dev.mcplatform.plugin.core;

import java.util.Objects;
import java.util.UUID;

/**
 * Identidade de um jogador como o servidor Paper a enxerga (espelha {@code PlayerIdentity}
 * de {@code packages/shared}). {@link UUID#toString()} já devolve minúsculas com hífens,
 * que é a forma normalizada que a API usa.
 */
public record PlayerIdentity(Platform platform, UUID uuid, String name) {

    public static final int NAME_MAX_LENGTH = 32;

    public PlayerIdentity {
        Objects.requireNonNull(platform, "platform");
        Objects.requireNonNull(uuid, "uuid");
        Objects.requireNonNull(name, "name");
        name = name.strip();
        if (name.isEmpty() || name.length() > NAME_MAX_LENGTH) {
            throw new IllegalArgumentException("name deve ter de 1 a " + NAME_MAX_LENGTH + " caracteres");
        }
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c < 0x20 || c == 0x7f) {
                throw new IllegalArgumentException("name não pode ter caracteres de controle");
            }
        }
    }

    /** JSON no formato esperado pela API: {@code {"platform":"java","uuid":"...","name":"..."}}. */
    public String toJson() {
        return "{\"platform\":" + Json.quote(platform.wire())
                + ",\"uuid\":" + Json.quote(uuid.toString())
                + ",\"name\":" + Json.quote(name) + "}";
    }
}
