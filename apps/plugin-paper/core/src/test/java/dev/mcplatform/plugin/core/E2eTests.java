package dev.mcplatform.plugin.core;

import static dev.mcplatform.plugin.core.Check.eq;
import static dev.mcplatform.plugin.core.Check.section;
import static dev.mcplatform.plugin.core.Check.test;
import static dev.mcplatform.plugin.core.Check.throwsA;
import static dev.mcplatform.plugin.core.Check.yes;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Integração do núcleo Java com a API REAL (apps/api, Node). Só roda quando
 * {@code -Dmc.e2e.url=... -Dmc.e2e.secret=...} estão definidos (veja README.md do plugin).
 *
 * <p>Prova que a assinatura HMAC feita em Java é aceita pelo Fastify e que o contrato
 * (allow/deny, limite de 10, saída libera vaga, heartbeat reconcilia) bate nas duas pontas.
 * Exige uma API recém-iniciada, com banco vazio.
 */
final class E2eTests {

    private E2eTests() {}

    private static PlayerIdentity player(int n) {
        return new PlayerIdentity(Platform.JAVA, new UUID(0x1000L + n, 0xABCDL), "Jogador" + n);
    }

    static void runIfConfigured() {
        String url = System.getProperty("mc.e2e.url");
        String secret = System.getProperty("mc.e2e.secret");
        if (url == null || secret == null) {
            System.out.println("E2E contra a API real: ignorado (defina -Dmc.e2e.url e -Dmc.e2e.secret).");
            return;
        }
        section("E2E contra a API real (" + url + ")");
        ApiClient client = new ApiClient(new HttpApiTransport(URI.create(url), secret, Duration.ofSeconds(5)));
        List<PlayerIdentity> online = new ArrayList<>();

        test("segredo errado: API responde 401 e o cliente classifica como REJECTED", () -> {
            ApiClient bad = new ApiClient(new HttpApiTransport(URI.create(url), secret + "x", Duration.ofSeconds(5)));
            eq(ApiException.Kind.REJECTED, throwsA(ApiException.class, () -> bad.admit(player(0))).kind());
        });
        test("10 primeiros jogadores: admitidos e confirmados por evento join", () -> {
            for (int i = 1; i <= 10; i++) {
                yes(client.admit(player(i)).allowed(), "admissão " + i);
                client.sendEvent(ApiClient.EventType.JOIN, player(i));
                online.add(player(i));
            }
        });
        test("11º jogador: negado com SERVER_FULL e mensagem em PT-BR", () -> {
            Decision d = client.admit(player(11));
            yes(!d.allowed(), "deve negar");
            eq("SERVER_FULL", d.reason());
            yes(d.message().contains("cheio"), "mensagem em português");
        });
        test("evento join repetido é idempotente (continua cheio, sem erro)", () -> {
            client.sendEvent(ApiClient.EventType.JOIN, player(1));
            eq("SERVER_FULL", client.admit(player(11)).reason());
        });
        test("quit libera a vaga para o próximo", () -> {
            client.sendEvent(ApiClient.EventType.QUIT, player(10));
            online.remove(player(10));
            yes(client.admit(player(11)).allowed(), "vaga liberada");
        });
        test("heartbeat com lista real reconcilia (vaga reservada continua válida)", () -> {
            client.sendHeartbeat(online);
            yes(client.admit(player(11)).allowed(), "segue permitido após heartbeat");
        });
        test("heartbeat vazio derruba a presença: todos podem entrar de novo", () -> {
            client.sendHeartbeat(List.of());
            yes(client.admit(player(12)).allowed(), "servidor vazio admite");
        });
    }
}
