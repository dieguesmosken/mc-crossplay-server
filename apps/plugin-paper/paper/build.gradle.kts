plugins {
    `java-library`
}

val javaRelease = providers.gradleProperty("javaRelease").map(String::toInt).get()

repositories {
    mavenCentral()
    maven(url = "https://repo.papermc.io/repository/maven-public/") {
        name = "papermc"
    }
}

dependencies {
    implementation(project(":core"))
    // TODO: fixar a build depois da primeira resolução no CI (a regra do projeto é versões fixas).
    compileOnly("io.papermc.paper:paper-api:26.3.build.+")
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(javaRelease)
    options.encoding = "UTF-8"
    options.compilerArgs.add("-Xlint:all")
}

tasks.processResources {
    val pluginVersion = project.version.toString()
    inputs.property("pluginVersion", pluginVersion)
    filesMatching("plugin.yml") { expand("version" to pluginVersion) }
}

// O núcleo não tem dependências: basta empacotar as classes dele no mesmo jar.
tasks.jar {
    dependsOn(":core:classes")
    from(project(":core").extensions.getByType<SourceSetContainer>()["main"].output)
    archiveBaseName.set("mc-platform")
}
