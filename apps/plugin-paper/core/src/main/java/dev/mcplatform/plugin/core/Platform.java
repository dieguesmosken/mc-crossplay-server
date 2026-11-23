package dev.mcplatform.plugin.core;

import java.util.UUID;

/** Plataforma do jogador, como a API espera em {@code player.platform}. */
public enum Platform {
    JAVA("java"),
    BEDROCK("bedrock");

    private final String wire;

    Platform(String wire) {
        this.wire = wire;
    }

    /** Valor enviado no JSON. */
    public String wire() {
        return wire;
    }

    /**
     * Heurística de reserva quando a API do Floodgate não está disponível: os UUIDs gerados
     * pelo Floodgate têm os 64 bits mais significativos zerados (derivados do XUID).
     * É só um plano B; a fonte preferida é {@code FloodgateApi#isFloodgatePlayer}.
     */
    public static Platform fromUuidHeuristic(UUID uuid) {
        return uuid.getMostSignificantBits() == 0L ? BEDROCK : JAVA;
    }
}
