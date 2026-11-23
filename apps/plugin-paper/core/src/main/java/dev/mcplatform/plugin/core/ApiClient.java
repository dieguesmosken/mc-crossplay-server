package dev.mcplatform.plugin.core;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Cliente do contrato de {@code docs/PLUGIN_CONTRACT.md}: admissions, events e heartbeat. */
public final class ApiClient {

    public enum EventType {
        JOIN("join"),
        QUIT("quit");

        private final String wire;

        EventType(String wire) {
            this.wire = wire;
        }
    }

    private static final int MAX_MESSAGE_LENGTH = 256;

    private final ApiTransport transport;

    public ApiClient(ApiTransport transport) {
        this.transport = Objects.requireNonNull(transport, "transport");
    }

    /** {@code POST /v1/server/admissions}. */
    public Decision admit(PlayerIdentity player) throws ApiException {
        Map<String, Object> body = postForObject(
                "/v1/server/admissions", "{\"player\":" + player.toJson() + "}");
        Object decision = body.get("decision");
        if ("allow".equals(decision)) {
            return Decision.allow(Decision.Origin.API);
        }
        if ("deny".equals(decision)) {
            String reason = body.get("reason") instanceof String r ? r : "";
            if (!Decision.DEFAULT_MESSAGES.containsKey(reason)
                    || reason.equals(Decision.API_UNAVAILABLE)
                    || reason.equals(Decision.MISCONFIGURED)) {
                reason = Decision.NOT_ALLOWED; // motivo desconhecido: nega com a mensagem genérica
            }
            String message = sanitizeMessage(body.get("message"));
            return message.isEmpty()
                    ? Decision.deny(reason, Decision.Origin.API)
                    : Decision.deny(reason, message, Decision.Origin.API);
        }
        throw new ApiException(ApiException.Kind.INVALID_RESPONSE, "campo decision ausente ou desconhecido");
    }

    /** {@code POST /v1/server/events}. */
    public void sendEvent(EventType type, PlayerIdentity player) throws ApiException {
        expectOk(postForObject(
                "/v1/server/events", "{\"type\":" + Json.quote(type.wire) + ",\"player\":" + player.toJson() + "}"));
    }

    /** {@code POST /v1/server/heartbeat}: lista real dos jogadores online. */
    public void sendHeartbeat(List<PlayerIdentity> players) throws ApiException {
        Map<UUID, PlayerIdentity> unique = new LinkedHashMap<>();
        for (PlayerIdentity p : players) unique.putIfAbsent(p.uuid(), p); // a API recusa UUID repetido
        StringBuilder json = new StringBuilder("{\"players\":[");
        boolean first = true;
        for (PlayerIdentity p : unique.values()) {
            if (!first) json.append(',');
            json.append(p.toJson());
            first = false;
        }
        expectOk(postForObject("/v1/server/heartbeat", json.append("]}").toString()));
    }

    private static void expectOk(Map<String, Object> body) throws ApiException {
        if (!Boolean.TRUE.equals(body.get("ok"))) {
            throw new ApiException(ApiException.Kind.INVALID_RESPONSE, "resposta sem ok=true");
        }
    }

    /** Remove caracteres de controle e limita o tamanho: a mensagem vai direto para a tela do jogador. */
    private static String sanitizeMessage(Object raw) {
        if (!(raw instanceof String text)) return "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < text.length() && out.length() < MAX_MESSAGE_LENGTH; i++) {
            char c = text.charAt(i);
            if (c >= 0x20 && c != 0x7f) out.append(c);
        }
        return out.toString().strip();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postForObject(String path, String body) throws ApiException {
        ApiTransport.Response response;
        try {
            response = transport.post(path, body);
        } catch (IOException e) {
            throw new ApiException(ApiException.Kind.UNAVAILABLE, "falha de rede ao chamar " + path, e);
        }
        int status = response.status();
        if (status >= 500) {
            throw new ApiException(ApiException.Kind.UNAVAILABLE, "API respondeu " + status + " em " + path);
        }
        if (status != 200) {
            // 401 = assinatura/segredo/relógio; 400 = corpo recusado. Não registra o corpo.
            throw new ApiException(ApiException.Kind.REJECTED, "API respondeu " + status + " em " + path);
        }
        Object parsed;
        try {
            parsed = Json.parse(response.body());
        } catch (Json.ParseException e) {
            throw new ApiException(ApiException.Kind.INVALID_RESPONSE, "JSON inválido em " + path, e);
        }
        if (!(parsed instanceof Map<?, ?>)) {
            throw new ApiException(ApiException.Kind.INVALID_RESPONSE, "resposta não é um objeto em " + path);
        }
        return (Map<String, Object>) parsed;
    }
}
