package dev.mcplatform.plugin.core;

import static dev.mcplatform.plugin.core.Check.eq;
import static dev.mcplatform.plugin.core.Check.section;
import static dev.mcplatform.plugin.core.Check.test;
import static dev.mcplatform.plugin.core.Check.throwsA;
import static dev.mcplatform.plugin.core.Check.yes;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Ponto de entrada dos testes do núcleo. Sai com código 1 se algum falhar. */
public final class AllTests {

    private static final UUID JAVA_UUID = UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    private static final UUID BEDROCK_UUID = UUID.fromString("00000000-0000-0000-0009-01f64f65c7c3");
    private static final String SECRET = "0123456789abcdef-segredo";

    private AllTests() {}

    /** Transporte falso: devolve respostas programadas e guarda os pedidos. */
    private static final class FakeTransport implements ApiTransport {
        final List<String[]> requests = new ArrayList<>(); // {path, body}
        Response response = new Response(200, "{}");
        IOException failure;

        @Override
        public Response post(String path, String body) throws IOException {
            requests.add(new String[] {path, body});
            if (failure != null) throw failure;
            return response;
        }
    }

    private static PlayerIdentity javaPlayer() {
        return new PlayerIdentity(Platform.JAVA, JAVA_UUID, "Notch");
    }

    private static PlayerIdentity bedrockPlayer() {
        return new PlayerIdentity(Platform.BEDROCK, BEDROCK_UUID, ".Steve");
    }

    public static void main(String[] args) throws Exception {
        json();
        signer();
        identity();
        apiClient();
        admissionService();
        presenceReporter();
        settings();
        HttpTransportTests.run();
        E2eTests.runIfConfigured();
        System.exit(Check.summary() == 0 ? 0 : 1);
    }

    private static void json() {
        section("Json");
        test("quote escapa aspas, barra, controle e preserva acentos", () -> {
            eq("\"a\\\"b\\\\c\\n\\u0001\u00e9\"", Json.quote("a\"b\\c\n\u0001\u00e9"));
        });
        test("parse lê objeto, lista, números, booleanos, null e escapes", () -> {
            Object v = Json.parse(" {\"a\":[1,2.5,true,false,null],\"b\":\"x\\u00e9\\n\",\"c\":{}} ");
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) v;
            eq(List.of(1.0, 2.5, true, false), ((List<?>) m.get("a")).subList(0, 4));
            eq(null, ((List<?>) m.get("a")).get(4));
            eq("x\u00e9\n", m.get("b"));
            eq(Map.of(), m.get("c"));
        });
        test("parse recusa lixo, texto extra, string aberta e aninhamento excessivo", () -> {
            for (String bad : new String[] {"", "{", "{\"a\":}", "{\"a\":1} x", "\"abc", "[1,]", "{a:1}", "tru", "\"\\q\""}) {
                throwsA(Json.ParseException.class, () -> Json.parse(bad));
            }
            throwsA(Json.ParseException.class, () -> Json.parse("[".repeat(40) + "]".repeat(40)));
        });
    }

    private static void signer() {
        section("RequestSigner (vetores gerados pelo signRequest de packages/shared)");
        test("assinatura igual à da implementação TypeScript", () -> {
            eq(
                    "7e01e75107326a7ce7fde3aeea1056317f08dff6af345b923f58c76b828349ff",
                    RequestSigner.sign(SECRET, 1_700_000_000_000L, "{\"player\":{\"name\":\"Z\u00e9 \\\"x\\\"\"}}"));
            eq(
                    "6135248f4aa1a402546ef10e7ecdd1faffc205e3a7952443e100613a80dfe975",
                    RequestSigner.sign(SECRET, 1_700_000_000_000L, ""));
        });
    }

    private static void identity() {
        section("PlayerIdentity / Platform");
        test("toJson no formato do contrato", () -> {
            eq(
                    "{\"platform\":\"java\",\"uuid\":\"069a79f4-44e9-4726-a5be-fca90e38aaf5\",\"name\":\"Notch\"}",
                    javaPlayer().toJson());
            eq("bedrock", bedrockPlayer().platform().wire());
        });
        test("nome é aparado e validado (vazio, longo, controle)", () -> {
            eq("Ana", new PlayerIdentity(Platform.JAVA, JAVA_UUID, "  Ana ").name());
            throwsA(IllegalArgumentException.class, () -> new PlayerIdentity(Platform.JAVA, JAVA_UUID, "   "));
            throwsA(IllegalArgumentException.class, () -> new PlayerIdentity(Platform.JAVA, JAVA_UUID, "a".repeat(33)));
            throwsA(IllegalArgumentException.class, () -> new PlayerIdentity(Platform.JAVA, JAVA_UUID, "a\nb"));
        });
        test("heurística do Floodgate: msb zerado = Bedrock", () -> {
            eq(Platform.BEDROCK, Platform.fromUuidHeuristic(BEDROCK_UUID));
            eq(Platform.JAVA, Platform.fromUuidHeuristic(JAVA_UUID));
        });
    }

    private static void apiClient() {
        section("ApiClient");
        test("admit: allow, e o pedido vai para a rota certa com o corpo do contrato", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"decision\":\"allow\"}");
            Decision d = new ApiClient(t).admit(javaPlayer());
            yes(d.allowed(), "allow");
            eq(Decision.Origin.API, d.origin());
            eq("/v1/server/admissions", t.requests.get(0)[0]);
            eq("{\"player\":" + javaPlayer().toJson() + "}", t.requests.get(0)[1]);
        });
        test("admit: deny usa reason e a mensagem da API (sem caracteres de controle)", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(
                    200, "{\"decision\":\"deny\",\"reason\":\"SERVER_FULL\",\"message\":\"Lotado\\u0007!\\n\"}");
            Decision d = new ApiClient(t).admit(javaPlayer());
            yes(!d.allowed(), "deny");
            eq("SERVER_FULL", d.reason());
            eq("Lotado!", d.message());
        });
        test("admit: deny sem mensagem usa a mensagem padrão em PT-BR", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"decision\":\"deny\",\"reason\":\"IN_QUEUE\"}");
            eq(Decision.DEFAULT_MESSAGES.get("IN_QUEUE"), new ApiClient(t).admit(javaPlayer()).message());
        });
        test("admit: motivo desconhecido (ou reservado do plugin) vira NOT_ALLOWED", () -> {
            FakeTransport t = new FakeTransport();
            for (String reason : new String[] {"BANANA", "API_UNAVAILABLE"}) {
                t.response = new ApiTransport.Response(200, "{\"decision\":\"deny\",\"reason\":\"" + reason + "\"}");
                eq("NOT_ALLOWED", new ApiClient(t).admit(javaPlayer()).reason());
            }
        });
        test("admit: mensagem da API é limitada a 256 caracteres", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(
                    200, "{\"decision\":\"deny\",\"reason\":\"NOT_ALLOWED\",\"message\":\"" + "x".repeat(1000) + "\"}");
            eq(256, new ApiClient(t).admit(javaPlayer()).message().length());
        });
        test("erros: 401/400 = REJECTED; 500/503 = UNAVAILABLE; rede = UNAVAILABLE", () -> {
            FakeTransport t = new FakeTransport();
            ApiClient c = new ApiClient(t);
            for (int status : new int[] {400, 401, 404}) {
                t.response = new ApiTransport.Response(status, "{\"error\":\"x\"}");
                eq(ApiException.Kind.REJECTED, throwsA(ApiException.class, () -> c.admit(javaPlayer())).kind());
            }
            for (int status : new int[] {500, 503}) {
                t.response = new ApiTransport.Response(status, "");
                eq(ApiException.Kind.UNAVAILABLE, throwsA(ApiException.class, () -> c.admit(javaPlayer())).kind());
            }
            t.failure = new IOException("timeout");
            eq(ApiException.Kind.UNAVAILABLE, throwsA(ApiException.class, () -> c.admit(javaPlayer())).kind());
        });
        test("resposta 200 fora do contrato = INVALID_RESPONSE", () -> {
            FakeTransport t = new FakeTransport();
            ApiClient c = new ApiClient(t);
            for (String body : new String[] {"", "[]", "{}", "{\"decision\":\"talvez\"}", "<html>"}) {
                t.response = new ApiTransport.Response(200, body);
                eq(ApiException.Kind.INVALID_RESPONSE, throwsA(ApiException.class, () -> c.admit(javaPlayer())).kind());
            }
        });
        test("sendEvent: corpo do contrato e exige ok=true", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"ok\":true}");
            new ApiClient(t).sendEvent(ApiClient.EventType.QUIT, bedrockPlayer());
            eq("/v1/server/events", t.requests.get(0)[0]);
            eq("{\"type\":\"quit\",\"player\":" + bedrockPlayer().toJson() + "}", t.requests.get(0)[1]);
            t.response = new ApiTransport.Response(200, "{\"ok\":false}");
            throwsA(ApiException.class, () -> new ApiClient(t).sendEvent(ApiClient.EventType.JOIN, javaPlayer()));
        });
        test("sendHeartbeat: lista, remove UUID repetido e aceita lista vazia", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"ok\":true}");
            ApiClient c = new ApiClient(t);
            c.sendHeartbeat(List.of(javaPlayer(), bedrockPlayer(), javaPlayer()));
            eq("{\"players\":[" + javaPlayer().toJson() + "," + bedrockPlayer().toJson() + "]}", t.requests.get(0)[1]);
            c.sendHeartbeat(List.of());
            eq("{\"players\":[]}", t.requests.get(1)[1]);
        });
    }

    private static void admissionService() {
        section("AdmissionService");
        test("bypass local libera sem chamar a API", () -> {
            FakeTransport t = new FakeTransport();
            AdmissionService s = new AdmissionService(new ApiClient(t), FailPolicy.CLOSED, m -> {});
            Decision d = s.decide(javaPlayer(), true);
            yes(d.allowed(), "allow");
            eq(Decision.Origin.LOCAL_BYPASS, d.origin());
            eq(0, t.requests.size());
        });
        test("sem bypass, segue a decisão da API", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"decision\":\"deny\",\"reason\":\"SERVER_FULL\"}");
            Decision d = new AdmissionService(new ApiClient(t), FailPolicy.OPEN, m -> {}).decide(javaPlayer(), false);
            yes(!d.allowed(), "deny");
            eq("SERVER_FULL", d.reason());
        });
        test("API fora + closed = nega com API_UNAVAILABLE; bypass continua liberado", () -> {
            FakeTransport t = new FakeTransport();
            t.failure = new IOException("recusou conexão");
            List<String> logs = new ArrayList<>();
            AdmissionService s = new AdmissionService(new ApiClient(t), FailPolicy.CLOSED, logs::add);
            Decision d = s.decide(javaPlayer(), false);
            yes(!d.allowed(), "deny");
            eq(Decision.Origin.FAIL_CLOSED, d.origin());
            eq("API_UNAVAILABLE", d.reason());
            yes(s.decide(javaPlayer(), true).allowed(), "bypass");
            eq(1, logs.size());
            yes(!logs.get(0).contains(SECRET), "log sem segredo");
        });
        test("API fora + open = libera (FAIL_OPEN)", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(503, "");
            Decision d = new AdmissionService(new ApiClient(t), FailPolicy.OPEN, m -> {}).decide(javaPlayer(), false);
            yes(d.allowed(), "allow");
            eq(Decision.Origin.FAIL_OPEN, d.origin());
        });
        test("401 também aplica a política (segredo errado não derruba o login)", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(401, "{\"error\":\"unauthorized\"}");
            Decision d = new AdmissionService(new ApiClient(t), FailPolicy.CLOSED, m -> {}).decide(javaPlayer(), false);
            eq(Decision.Origin.FAIL_CLOSED, d.origin());
        });
        test("erro inesperado (RuntimeException) não escapa", () -> {
            ApiTransport boom = (path, body) -> {
                throw new IllegalStateException("bug");
            };
            Decision d = new AdmissionService(new ApiClient(boom), FailPolicy.CLOSED, m -> {}).decide(javaPlayer(), false);
            eq(Decision.Origin.FAIL_CLOSED, d.origin());
        });
        test("sem configuração válida (client null) nega sempre, mesmo com open", () -> {
            AdmissionService s = new AdmissionService(null, FailPolicy.OPEN, m -> {});
            Decision d = s.decide(javaPlayer(), false);
            yes(!d.allowed(), "deny");
            eq(Decision.Origin.MISCONFIGURED, d.origin());
            yes(s.decide(javaPlayer(), true).allowed(), "bypass segue valendo");
        });
    }

    private static void presenceReporter() {
        section("PresenceReporter");
        test("join, quit e heartbeat chegam à API na ordem", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"ok\":true}");
            PresenceReporter r = new PresenceReporter(new ApiClient(t), Runnable::run, m -> {});
            r.playerJoined(javaPlayer());
            r.heartbeat(List.of(javaPlayer()));
            r.playerQuit(javaPlayer());
            eq(List.of("/v1/server/events", "/v1/server/heartbeat", "/v1/server/events"),
                    t.requests.stream().map(q -> q[0]).toList());
            yes(t.requests.get(0)[1].contains("\"join\""), "join");
            yes(t.requests.get(2)[1].contains("\"quit\""), "quit");
        });
        test("falha da API só gera log; executor recusando também", () -> {
            FakeTransport t = new FakeTransport();
            t.failure = new IOException("fora");
            List<String> logs = new ArrayList<>();
            new PresenceReporter(new ApiClient(t), Runnable::run, logs::add).playerJoined(javaPlayer());
            eq(1, logs.size());
            PresenceReporter rejected = new PresenceReporter(new ApiClient(t), r -> {
                throw new java.util.concurrent.RejectedExecutionException();
            }, logs::add);
            rejected.heartbeat(List.of());
            eq(2, logs.size());
        });
        test("heartbeat guarda cópia da lista (mutação posterior não vaza)", () -> {
            FakeTransport t = new FakeTransport();
            t.response = new ApiTransport.Response(200, "{\"ok\":true}");
            List<Runnable> queued = new ArrayList<>();
            PresenceReporter r = new PresenceReporter(new ApiClient(t), queued::add, m -> {});
            List<PlayerIdentity> online = new ArrayList<>(List.of(javaPlayer()));
            r.heartbeat(online);
            online.clear();
            queued.get(0).run();
            yes(t.requests.get(0)[1].contains("Notch"), "snapshot");
        });
    }

    private static void settings() {
        section("PluginSettings");
        test("configuração válida; toString não mostra o segredo", () -> {
            PluginSettings.Validation v = PluginSettings.validate(
                    "http://127.0.0.1:8787", SECRET, "closed", 3000, 15, true, true);
            yes(v.ok(), "ok");
            eq(URI.create("http://127.0.0.1:8787"), v.settings().apiUrl());
            eq(Duration.ofSeconds(3), v.settings().requestTimeout());
            yes(!v.settings().toString().contains(SECRET), "toString sem segredo");
            eq(0, v.warnings().size());
        });
        test("segredo ausente ou curto, política e limites inválidos viram erros", () -> {
            yes(!PluginSettings.validate("http://localhost:1", null, "closed", 3000, 15, true, true).ok(), "null");
            yes(!PluginSettings.validate("http://localhost:1", "curto", "closed", 3000, 15, true, true).ok(), "curto");
            yes(!PluginSettings.validate("http://localhost:1", SECRET, "talvez", 3000, 15, true, true).ok(), "policy");
            yes(!PluginSettings.validate("http://localhost:1", SECRET, "closed", 100, 15, true, true).ok(), "timeout");
            yes(!PluginSettings.validate("http://localhost:1", SECRET, "closed", 3000, 1, true, true).ok(), "heartbeat");
        });
        test("URL: esquema, host e credenciais embutidas", () -> {
            for (String bad : new String[] {"", "ftp://x", "localhost:8787", "http://", "http://user:pw@host", "http://a b"}) {
                yes(!PluginSettings.validate(bad, SECRET, "closed", 3000, 15, true, true).ok(), bad);
            }
        });
        test("avisos: http fora de localhost e fail-policy=open", () -> {
            PluginSettings.Validation v = PluginSettings.validate("http://10.0.0.5:8787", SECRET, "open", 3000, 15, true, true);
            yes(v.ok(), "ok");
            eq(2, v.warnings().size());
            eq(0, PluginSettings.validate("https://api.exemplo.com", SECRET, "closed", 3000, 15, true, true).warnings().size());
            eq(0, PluginSettings.validate("http://localhost:8787", SECRET, "closed", 3000, 15, true, true).warnings().size());
        });
    }
}
