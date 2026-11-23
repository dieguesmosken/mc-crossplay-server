package dev.mcplatform.plugin.core;

import java.io.IOException;

/** Camada de transporte (POST assinado). Existe para o {@link ApiClient} ser testável sem rede. */
public interface ApiTransport {

    record Response(int status, String body) {}

    /** Envia {@code body} (JSON) para {@code path}. Lança {@link IOException} em falha de rede/timeout. */
    Response post(String path, String body) throws IOException;
}
