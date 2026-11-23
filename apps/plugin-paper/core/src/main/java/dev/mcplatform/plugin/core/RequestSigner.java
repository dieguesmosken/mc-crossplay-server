package dev.mcplatform.plugin.core;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Assinatura dos pedidos à API: HMAC-SHA256 hexadecimal de {@code "<timestampMs>.<corpo>"}
 * (mesmo formato de {@code signRequest} em {@code packages/shared}).
 */
public final class RequestSigner {

    public static final String TIMESTAMP_HEADER = "x-mc-timestamp";
    public static final String SIGNATURE_HEADER = "x-mc-signature";

    private RequestSigner() {}

    public static String sign(String secret, long timestampMs, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal((timestampMs + "." + body).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (GeneralSecurityException e) {
            // HmacSHA256 é obrigatório em toda JVM; não deve acontecer.
            throw new IllegalStateException("HmacSHA256 indisponível", e);
        }
    }
}
