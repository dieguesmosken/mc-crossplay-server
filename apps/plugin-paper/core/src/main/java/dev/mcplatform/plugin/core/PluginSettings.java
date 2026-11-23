package dev.mcplatform.plugin.core;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Configuração validada do plugin. O segredo nunca aparece em {@link #toString()}. */
public record PluginSettings(
        URI apiUrl,
        String secret,
        FailPolicy failPolicy,
        Duration requestTimeout,
        int heartbeatSeconds,
        boolean bypassOps,
        boolean bypassWhitelist) {

    public static final int MIN_SECRET_LENGTH = 16;

    /** Resultado da validação: ou {@code settings} (sem erros) ou a lista de {@code errors}. */
    public record Validation(PluginSettings settings, List<String> errors, List<String> warnings) {
        public boolean ok() {
            return errors.isEmpty();
        }
    }

    public static Validation validate(
            String apiUrl,
            String secret,
            String failPolicy,
            long requestTimeoutMs,
            int heartbeatSeconds,
            boolean bypassOps,
            boolean bypassWhitelist) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        URI uri = null;
        try {
            uri = new URI(apiUrl == null ? "" : apiUrl.strip());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) {
                errors.add("api-url deve começar com http:// ou https://");
            } else if (uri.getHost() == null) {
                errors.add("api-url precisa de um host");
            } else if (uri.getUserInfo() != null) {
                errors.add("api-url não pode conter usuário/senha (use a variável MC_API_SECRET)");
            } else if (scheme.equals("http") && !isLoopback(uri.getHost())) {
                warnings.add("api-url usa http fora de localhost: o tráfego (assinado, mas não cifrado) pode ser lido na rede."
                        + " Use https ou uma rede privada.");
            }
        } catch (URISyntaxException e) {
            errors.add("api-url inválida");
        }

        if (secret == null || secret.length() < MIN_SECRET_LENGTH) {
            errors.add("defina a variável de ambiente MC_API_SECRET com pelo menos " + MIN_SECRET_LENGTH
                    + " caracteres (o segredo não fica no config.yml)");
        }
        FailPolicy policy = FailPolicy.parse(failPolicy).orElse(null);
        if (policy == null) errors.add("fail-policy deve ser \"closed\" ou \"open\"");
        else if (policy == FailPolicy.OPEN) {
            warnings.add("fail-policy=open: com a API fora do ar, QUALQUER jogador consegue entrar.");
        }
        if (requestTimeoutMs < 500 || requestTimeoutMs > 30_000) {
            errors.add("request-timeout-ms deve ficar entre 500 e 30000");
        }
        if (heartbeatSeconds < 5 || heartbeatSeconds > 300) {
            errors.add("heartbeat-seconds deve ficar entre 5 e 300");
        }

        if (!errors.isEmpty()) return new Validation(null, List.copyOf(errors), List.copyOf(warnings));
        return new Validation(
                new PluginSettings(
                        uri,
                        secret,
                        policy,
                        Duration.ofMillis(requestTimeoutMs),
                        heartbeatSeconds,
                        bypassOps,
                        bypassWhitelist),
                List.of(),
                List.copyOf(warnings));
    }

    private static boolean isLoopback(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("[::1]") || h.equals("::1");
    }

    @Override
    public String toString() {
        return "PluginSettings[apiUrl=" + apiUrl + ", secret=***, failPolicy=" + failPolicy
                + ", requestTimeout=" + requestTimeout + ", heartbeatSeconds=" + heartbeatSeconds
                + ", bypassOps=" + bypassOps + ", bypassWhitelist=" + bypassWhitelist + "]";
    }
}
