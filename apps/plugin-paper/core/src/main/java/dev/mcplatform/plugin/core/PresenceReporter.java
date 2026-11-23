package dev.mcplatform.plugin.core;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;

/**
 * Envia entradas, saídas e heartbeat à API fora da thread do servidor.
 * Falhas só viram log: o heartbeat seguinte reconcilia a presença.
 *
 * <p>Use um {@link Executor} de uma única thread para manter a ordem join → quit.
 */
public final class PresenceReporter {

    private final ApiClient client;
    private final Executor executor;
    private final Consumer<String> log;

    public PresenceReporter(ApiClient client, Executor executor, Consumer<String> log) {
        this.client = Objects.requireNonNull(client, "client");
        this.executor = Objects.requireNonNull(executor, "executor");
        this.log = Objects.requireNonNull(log, "log");
    }

    public void playerJoined(PlayerIdentity player) {
        submit("join", () -> client.sendEvent(ApiClient.EventType.JOIN, player));
    }

    public void playerQuit(PlayerIdentity player) {
        submit("quit", () -> client.sendEvent(ApiClient.EventType.QUIT, player));
    }

    /** Receba uma cópia imutável da lista (já tirada na thread principal do servidor). */
    public void heartbeat(List<PlayerIdentity> onlinePlayers) {
        List<PlayerIdentity> snapshot = List.copyOf(onlinePlayers);
        submit("heartbeat", () -> client.sendHeartbeat(snapshot));
    }

    private interface Call {
        void run() throws ApiException;
    }

    private void submit(String what, Call call) {
        try {
            executor.execute(() -> {
                try {
                    call.run();
                } catch (ApiException e) {
                    log.accept("Falha ao enviar " + what + " (" + e.kind() + "): " + e.getMessage());
                } catch (RuntimeException e) {
                    log.accept("Erro inesperado ao enviar " + what + ": " + e);
                }
            });
        } catch (RejectedExecutionException e) {
            log.accept("Envio de " + what + " descartado: plugin desligando.");
        }
    }
}
