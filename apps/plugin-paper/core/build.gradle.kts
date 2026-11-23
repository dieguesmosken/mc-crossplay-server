plugins {
    `java-library`
}

val javaRelease = providers.gradleProperty("javaRelease").map(String::toInt).get()

tasks.withType<JavaCompile>().configureEach {
    options.release.set(javaRelease)
    options.encoding = "UTF-8"
    options.compilerArgs.add("-Xlint:all")
}

// O núcleo não tem dependências (nem Bukkit, nem JUnit): os testes são classes simples
// executadas por AllTests, o que permite rodar em qualquer JDK/ambiente (inclusive Termux).
val coreTest by tasks.registering(JavaExec::class) {
    group = "verification"
    description = "Executa os testes do núcleo (sem JUnit)."
    dependsOn(tasks.named("testClasses"))
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("dev.mcplatform.plugin.core.AllTests")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8")
    // Teste de integração opcional contra a API real (veja README.md do plugin).
    listOf("mc.e2e.url", "mc.e2e.secret").forEach { key ->
        providers.systemProperty(key).orNull?.let { systemProperty(key, it) }
    }
}

// A task `test` padrão não tem o que rodar (sem JUnit) e gravaria um relatório em
// build/reports/tests/test/js/report.js, que o `node --test` da raiz descobriria e executaria
// como se fosse um teste (falha espúria). Os testes rodam pela `coreTest`.
tasks.named("test") { enabled = false }

tasks.named("check") { dependsOn(coreTest) }
