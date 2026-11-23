package dev.mcplatform.plugin.core;

import java.util.Objects;
import java.util.function.Consumer;

/**
 * Regra de admissão do plugin: bypass local, consulta à API e política de falha.
 * Nunca lança exceção: o evento de login do Paper não pode quebrar por causa da API.
 */
public final class AdmissionService {

    private final ApiClient client; // null = plugin sem configuração válida
    private final FailPolicy failPolicy;
    private final Consumer<String> log;

    /**
     * @param client {@code null} quando a configuração é inválida: todos (menos o bypass local)
     *     são negados, independentemente da política.
     */
    public AdmissionService(ApiClient client, FailPolicy failPolicy, Consumer<String> log) {
        this.client = client;
        this.failPolicy = Objects.requireNonNull(failPolicy, "failPolicy");
        this.log = Objects.requireNonNull(log, "log");
    }

    /** @param localBypass operador ou whitelist local (decidido pelo adaptador). */
    public Decision decide(PlayerIdentity player, boolean localBypass) {
        if (localBypass) {
            return Decision.allow(Decision.Origin.LOCAL_BYPASS);
        }
        if (client == null) {
            return Decision.deny(Decision.MISCONFIGURED, Decision.Origin.MISCONFIGURED);
        }
        try {
            return client.admit(player);
        } catch (ApiException e) {
            log.accept("API de admissão falhou (" + e.kind() + "): " + e.getMessage());
        } catch (RuntimeException e) {
            log.accept("Erro inesperado na admissão: " + e);
        }
        return failPolicy == FailPolicy.OPEN
                ? Decision.allow(Decision.Origin.FAIL_OPEN)
                : Decision.deny(Decision.API_UNAVAILABLE, Decision.Origin.FAIL_CLOSED);
    }
}
