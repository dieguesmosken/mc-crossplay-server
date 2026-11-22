package dev.mcplatform.plugin.paper;

import dev.mcplatform.plugin.core.AdmissionService;
import dev.mcplatform.plugin.core.ApiClient;
import dev.mcplatform.plugin.core.FailPolicy;
import dev.mcplatform.plugin.core.HttpApiTransport;
import dev.mcplatform.plugin.core.PlayerIdentity;
import dev.mcplatform.plugin.core.PluginSettings;
import dev.mcplatform.plugin.core.PresenceReporter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Adaptador Paper: liga o núcleo (sem Bukkit) aos eventos do servidor.
 *
 * <p>Fail-closed por padrão: se a configuração for inválida (por exemplo, sem {@code MC_API_SECRET}),
 * o plugin continua carregado e NEGA todos os jogadores comuns. Desligar o plugin deixaria
 * o servidor aberto, que é o pior resultado.
 */
public final class McPlatformPlugin extends JavaPlugin {

    static final String SECRET_ENV = "MC_API_SECRET";

    private ExecutorService apiExecutor;
    private PresenceReporter reporter;
    private PlatformDetector detector;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        FileConfiguration config = getConfig();

        PluginSettings.Validation validation = PluginSettings.validate(
                config.getString("api-url", "http://127.0.0.1:8787"),
                System.getenv(SECRET_ENV),
                config.getString("fail-policy", "closed"),
                config.getLong("request-timeout-ms", 3000L),
                config.getInt("heartbeat-seconds", 15),
                config.getBoolean("local-bypass.ops", true),
                config.getBoolean("local-bypass.whitelist", false));
        validation.warnings().forEach(w -> getLogger().warning(w));

        ApiClient client = null;
        FailPolicy failPolicy = FailPolicy.CLOSED;
        boolean bypassOps = config.getBoolean("local-bypass.ops", true);
        boolean bypassWhitelist = config.getBoolean("local-bypass.whitelist", false);

        if (validation.ok()) {
            PluginSettings settings = validation.settings();
            client = new ApiClient(new HttpApiTransport(settings.apiUrl(), settings.secret(), settings.requestTimeout()));
            failPolicy = settings.failPolicy();
            bypassOps = settings.bypassOps();
            bypassWhitelist = settings.bypassWhitelist();
            getLogger().info("Controle de acesso ativo. API: " + settings.apiUrl()
                    + " | política de falha: " + failPolicy.name().toLowerCase(Locale.ROOT));
        } else {
            validation.errors().forEach(e -> getLogger().severe("Configuração inválida: " + e));
            getLogger().severe("Plugin em modo FECHADO: apenas operadores (se local-bypass.ops=true) conseguem entrar até corrigir a configuração.");
        }

        AdmissionService admission = new AdmissionService(client, failPolicy, msg -> getLogger().warning(msg));
        detector = new PlatformDetector(msg -> getLogger().warning(msg));

        if (client != null) {
            apiExecutor = Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "mc-platform-api");
                thread.setDaemon(true);
                return thread;
            });
            reporter = new PresenceReporter(client, apiExecutor, msg -> getLogger().warning(msg));

            long periodTicks = validation.settings().heartbeatSeconds() * 20L;
            // Roda na thread principal (lê a lista de jogadores); o envio é assíncrono.
            getServer().getScheduler().runTaskTimer(this, this::sendHeartbeat, periodTicks, periodTicks);
        }

        getServer().getPluginManager().registerEvents(
                new PlayerListener(admission, reporter, detector, bypassOps, bypassWhitelist,
                        msg -> getLogger().info(msg)),
                this);
    }

    @Override
    public void onDisable() {
        if (apiExecutor != null) {
            apiExecutor.shutdown();
            try {
                apiExecutor.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void sendHeartbeat() {
        List<PlayerIdentity> online = new ArrayList<>();
        for (Player player : getServer().getOnlinePlayers()) {
            try {
                online.add(new PlayerIdentity(detector.platformOf(player.getUniqueId()), player.getUniqueId(), player.getName()));
            } catch (IllegalArgumentException e) {
                getLogger().warning("Jogador ignorado no heartbeat (nome inválido para a API): " + player.getUniqueId());
            }
        }
        reporter.heartbeat(online);
    }
}
