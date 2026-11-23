package dev.mcplatform.plugin.core;

import java.util.Objects;

/** Mini-harness de testes sem dependências (o núcleo não usa JUnit). */
final class Check {

    interface Body {
        void run() throws Exception;
    }

    private static int passed;
    private static int failed;

    private Check() {}

    static void test(String name, Body body) {
        try {
            body.run();
            passed++;
            System.out.println("  ok   " + name);
        } catch (Throwable t) {
            failed++;
            System.out.println("  FAIL " + name + " -> " + t);
            t.printStackTrace(System.out);
        }
    }

    static void section(String title) {
        System.out.println(title);
    }

    static void eq(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError("esperado <" + expected + "> mas veio <" + actual + ">");
        }
    }

    static void yes(boolean condition, String what) {
        if (!condition) throw new AssertionError("esperado verdadeiro: " + what);
    }

    static <T extends Throwable> T throwsA(Class<T> type, Body body) {
        try {
            body.run();
        } catch (Throwable t) {
            if (type.isInstance(t)) return type.cast(t);
            throw new AssertionError("esperado " + type.getSimpleName() + " mas veio " + t, t);
        }
        throw new AssertionError("esperado " + type.getSimpleName() + ", mas nada foi lançado");
    }

    static int summary() {
        System.out.println();
        System.out.println("Testes: " + (passed + failed) + ", passaram: " + passed + ", falharam: " + failed);
        return failed;
    }
}
