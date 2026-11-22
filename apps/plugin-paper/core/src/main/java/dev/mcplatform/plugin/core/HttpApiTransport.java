package dev.mcplatform.plugin.core;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;
import java.util.function.LongSupplier;

/** Transporte HTTP real ({@code java.net.http}), assinando cada pedido com HMAC-SHA256. */
public final class HttpApiTransport implements ApiTransport {

    private static final int MAX_RESPONSE_BYTES = 64 * 1024;

    private final URI baseUrl;
    private final String secret;
    private final Duration timeout;
    private final LongSupplier clockMs;
    private final HttpClient client;

    public HttpApiTransport(URI baseUrl, String secret, Duration timeout) {
        this(baseUrl, secret, timeout, System::currentTimeMillis);
    }

    public HttpApiTransport(URI baseUrl, String secret, Duration timeout, LongSupplier clockMs) {
        this.baseUrl = Objects.requireNonNull(baseUrl, "baseUrl");
        this.secret = Objects.requireNonNull(secret, "secret");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        this.clockMs = Objects.requireNonNull(clockMs, "clockMs");
        this.client = HttpClient.newBuilder()
                .connectTimeout(timeout)
                // Nunca seguir redirecionamentos: o pedido assinado só vale para o destino configurado.
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public Response post(String path, String body) throws IOException {
        long timestamp = clockMs.getAsLong();
        String base = baseUrl.toString();
        URI target = URI.create((base.endsWith("/") ? base.substring(0, base.length() - 1) : base) + path);
        HttpRequest request = HttpRequest.newBuilder(target)
                .timeout(timeout)
                .header("content-type", "application/json")
                .header(RequestSigner.TIMESTAMP_HEADER, Long.toString(timestamp))
                .header(RequestSigner.SIGNATURE_HEADER, RequestSigner.sign(secret, timestamp, body))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = response.body()) {
                byte[] bytes = in.readNBytes(MAX_RESPONSE_BYTES);
                return new Response(response.statusCode(), new String(bytes, StandardCharsets.UTF_8));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("pedido interrompido", e);
        }
    }
}
