package dev.mcplatform.plugin.core;

import static dev.mcplatform.plugin.core.Check.eq;
import static dev.mcplatform.plugin.core.Check.section;
import static dev.mcplatform.plugin.core.Check.test;
import static dev.mcplatform.plugin.core.Check.throwsA;
import static dev.mcplatform.plugin.core.Check.yes;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/** Testa {@link HttpApiTransport} contra um servidor HTTP local (só JDK, sem rede externa). */
final class HttpTransportTests {

    private static final String SECRET = "0123456789abcdef-segredo";

    private HttpTransportTests() {}

    private record Seen(String method, String path, String timestamp, String signature, String contentType, String body) {}

    static void run() throws Exception {
        section("HttpApiTransport (servidor local)");
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        AtomicReference<Seen> seen = new AtomicReference<>();
        server.createContext("/v1/server/admissions", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            seen.set(new Seen(
                    ex.getRequestMethod(),
                    ex.getRequestURI().getPath(),
                    ex.getRequestHeaders().getFirst(RequestSigner.TIMESTAMP_HEADER),
                    ex.getRequestHeaders().getFirst(RequestSigner.SIGNATURE_HEADER),
                    ex.getRequestHeaders().getFirst("content-type"),
                    body));
            reply(ex, 200, "{\"decision\":\"allow\"}");
        });
        server.createContext("/redirect", ex -> {
            ex.getResponseHeaders().add("location", "/v1/server/admissions");
            reply(ex, 302, "");
        });
        server.createContext("/slow", ex -> {
            try {
                Thread.sleep(2_000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            reply(ex, 200, "{}");
        });
        server.createContext("/huge", ex -> reply(ex, 200, "x".repeat(200_000)));
        // Várias threads: o handler /slow não pode enfileirar os pedidos seguintes.
        ExecutorService pool = Executors.newCachedThreadPool();
        server.setExecutor(pool);
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        PlayerIdentity player = new PlayerIdentity(
                Platform.JAVA, UUID.fromString("069a79f4-44e9-4726-a5be-fca90e38aaf5"), "Notch");
        try {
            test("envia POST JSON com timestamp e assinatura que o servidor consegue recomputar", () -> {
                HttpApiTransport transport = new HttpApiTransport(
                        URI.create(base), SECRET, Duration.ofSeconds(3), () -> 1_700_000_000_123L);
                ApiTransport.Response response = transport.post("/v1/server/admissions", "{\"player\":" + player.toJson() + "}");
                eq(200, response.status());
                Seen s = seen.get();
                eq("POST", s.method());
                eq("application/json", s.contentType());
                eq("1700000000123", s.timestamp());
                eq(RequestSigner.sign(SECRET, 1_700_000_000_123L, s.body()), s.signature());
                eq("{\"player\":" + player.toJson() + "}", s.body());
            });
            test("ApiClient completo sobre HTTP real: allow", () -> {
                ApiClient client = new ApiClient(new HttpApiTransport(URI.create(base + "/"), SECRET, Duration.ofSeconds(3)));
                yes(client.admit(player).allowed(), "allow");
            });
            test("não segue redirecionamento (o pedido assinado não pode ir para outro destino)", () -> {
                HttpApiTransport transport = new HttpApiTransport(URI.create(base), SECRET, Duration.ofSeconds(3));
                eq(302, transport.post("/redirect", "{}").status());
            });
            test("timeout vira IOException (e o ApiClient o trata como UNAVAILABLE)", () -> {
                HttpApiTransport transport = new HttpApiTransport(URI.create(base), SECRET, Duration.ofMillis(500));
                throwsA(IOException.class, () -> transport.post("/slow", "{}"));
                ApiClient client = new ApiClient(transport);
                // /slow não é a rota de admissão; basta provar que o erro de rede é classificado.
                ApiClient slow = new ApiClient((path, body) -> transport.post("/slow", body));
                eq(ApiException.Kind.UNAVAILABLE, throwsA(ApiException.class, () -> slow.admit(player)).kind());
                yes(client != null, "client criado");
            });
            test("resposta é lida no máximo até 64 KiB", () -> {
                HttpApiTransport transport = new HttpApiTransport(URI.create(base), SECRET, Duration.ofSeconds(3));
                eq(64 * 1024, transport.post("/huge", "{}").body().length());
            });
            test("porta fechada = IOException", () -> {
                HttpServer closed = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
                int port = closed.getAddress().getPort();
                closed.stop(0); // porta livre: ninguém escutando
                HttpApiTransport transport = new HttpApiTransport(
                        URI.create("http://127.0.0.1:" + port), SECRET, Duration.ofMillis(800));
                throwsA(IOException.class, () -> transport.post("/v1/server/admissions", "{}"));
            });
        } finally {
            server.stop(0);
            pool.shutdownNow();
        }
    }

    private static void reply(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) ex.getResponseBody().write(bytes);
        ex.close();
    }
}
