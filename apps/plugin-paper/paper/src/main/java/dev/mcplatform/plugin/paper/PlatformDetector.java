package dev.mcplatform.plugin.paper;

import dev.mcplatform.plugin.core.Platform;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.function.Consumer;
import org.bukkit.Bukkit;

/**
 * Descobre se o jogador é Java ou Bedrock. Usa a API do Floodgate por reflexão (sem dependência
 * de compilação, para o plugin carregar mesmo sem o Floodgate) e, se ela não estiver disponível,
 * a heurística de UUID do núcleo.
 */
final class PlatformDetector {

    private static final String FLOODGATE_API = "org.geysermc.floodgate.api.FloodgateApi";

    private final Consumer<String> warn;
    private volatile Object api;
    private volatile Method isFloodgatePlayer;
    private volatile boolean warned;

    PlatformDetector(Consumer<String> warn) {
        this.warn = warn;
    }

    Platform platformOf(UUID uuid) {
        try {
            resolve();
            if (api != null) {
                return Boolean.TRUE.equals(isFloodgatePlayer.invoke(api, uuid)) ? Platform.BEDROCK : Platform.JAVA;
            }
        } catch (ReflectiveOperationException | RuntimeException e) {
            if (!warned) {
                warned = true;
                warn.accept("Não foi possível consultar o Floodgate (" + e + "); usando heurística de UUID.");
            }
        }
        return Platform.fromUuidHeuristic(uuid);
    }

    private void resolve() throws ReflectiveOperationException {
        if (api != null) return;
        if (Bukkit.getPluginManager().getPlugin("floodgate") == null) return;
        Class<?> type = Class.forName(FLOODGATE_API);
        Object instance = type.getMethod("getInstance").invoke(null);
        if (instance == null) return; // Floodgate ainda inicializando
        isFloodgatePlayer = type.getMethod("isFloodgatePlayer", UUID.class);
        api = instance;
    }
}
