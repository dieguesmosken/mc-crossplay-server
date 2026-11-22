package dev.mcplatform.plugin.paper;

import dev.mcplatform.plugin.core.AdmissionService;
import dev.mcplatform.plugin.core.Decision;
import dev.mcplatform.plugin.core.PlayerIdentity;
import dev.mcplatform.plugin.core.PresenceReporter;
import java.util.UUID;
import java.util.function.Consumer;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/** Eventos do Paper: admissão no pré-login e avisos de entrada/saída. */
final class PlayerListener implements Listener {

    private final AdmissionService admission;
    private final PresenceReporter reporter; // null quando a configuração é inválida
    private final PlatformDetector detector;
    private final boolean bypassOps;
    private final boolean bypassWhitelist;
    private final Consumer<String> info;

    PlayerListener(
            AdmissionService admission,
            PresenceReporter reporter,
            PlatformDetector detector,
            boolean bypassOps,
            boolean bypassWhitelist,
            Consumer<String> info) {
        this.admission = admission;
        this.reporter = reporter;
        this.detector = detector;
        this.bypassOps = bypassOps;
        this.bypassWhitelist = bypassWhitelist;
        this.info = info;
    }

    /**
     * Roda fora da thread principal: pode bloquear na chamada HTTP (limitada pelo timeout configurado).
     * Prioridade HIGH para respeitar antes as recusas do próprio servidor (ban, whitelist vanilla, lotação).
     */
    @EventHandler(priority = EventPriority.HIGH)
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        if (event.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) {
            return; // já recusado por ban/whitelist vanilla/servidor cheio: não consulta a API
        }
        UUID uuid = event.getUniqueId();
        PlayerIdentity identity;
        try {
            identity = new PlayerIdentity(detector.platformOf(uuid), uuid, event.getName());
        } catch (IllegalArgumentException e) {
            event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_OTHER, Component.text(Decision.DEFAULT_MESSAGES.get(Decision.NOT_ALLOWED)));
            return;
        }

        Decision decision = admission.decide(identity, hasLocalBypass(uuid));
        if (decision.allowed()) {
            return;
        }
        info.accept("Entrada negada: " + identity.name() + " (" + decision.reason() + ", " + decision.origin() + ")");
        AsyncPlayerPreLoginEvent.Result result = Decision.SERVER_FULL.equals(decision.reason())
                ? AsyncPlayerPreLoginEvent.Result.KICK_FULL
                : AsyncPlayerPreLoginEvent.Result.KICK_OTHER;
        event.disallow(result, Component.text(decision.message()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        if (reporter == null) return;
        PlayerIdentity identity = identityOf(event.getPlayer());
        if (identity != null) reporter.playerJoined(identity);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        if (reporter == null) return;
        PlayerIdentity identity = identityOf(event.getPlayer());
        if (identity != null) reporter.playerQuit(identity);
    }

    private PlayerIdentity identityOf(Player player) {
        try {
            return new PlayerIdentity(detector.platformOf(player.getUniqueId()), player.getUniqueId(), player.getName());
        } catch (IllegalArgumentException e) {
            return null; // o próximo heartbeat reconcilia
        }
    }

    private boolean hasLocalBypass(UUID uuid) {
        if (!bypassOps && !bypassWhitelist) return false;
        OfflinePlayer offline = Bukkit.getOfflinePlayer(uuid);
        return (bypassOps && offline.isOp()) || (bypassWhitelist && offline.isWhitelisted());
    }
}
