// Projeto raiz: sem código. Veja core/ (sem dependências) e paper/ (adaptador Paper).
allprojects {
    group = "dev.mcplatform"
    version = providers.gradleProperty("pluginVersion").get()
}
