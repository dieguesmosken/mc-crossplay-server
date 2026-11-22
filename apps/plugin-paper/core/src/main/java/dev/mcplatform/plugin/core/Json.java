package dev.mcplatform.plugin.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON mínimo e estrito, sem dependências: o núcleo não depende de Gson/Jackson para continuar
 * testável fora do servidor. Só precisa de objetos pequenos (corpos da API).
 *
 * <p>Tipos devolvidos por {@link #parse}: {@code Map<String,Object>}, {@code List<Object>},
 * {@code String}, {@code Double}, {@code Boolean} e {@code null}.
 */
public final class Json {

    private static final int MAX_DEPTH = 16;

    private Json() {}

    public static final class ParseException extends Exception {
        private static final long serialVersionUID = 1L;

        ParseException(String message, int position) {
            super(message + " (posição " + position + ")");
        }
    }

    /** Coloca o texto entre aspas, com escapes válidos de JSON. */
    public static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (c < 0x20 || c == 0x7f) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }

    public static Object parse(String text) throws ParseException {
        Parser parser = new Parser(text);
        parser.skipWhitespace();
        Object value = parser.readValue(0);
        parser.skipWhitespace();
        if (!parser.atEnd()) {
            throw new ParseException("texto extra após o JSON", parser.pos);
        }
        return value;
    }

    private static final class Parser {
        private final String text;
        private int pos;

        Parser(String text) {
            this.text = text;
        }

        boolean atEnd() {
            return pos >= text.length();
        }

        void skipWhitespace() {
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') pos++;
                else break;
            }
        }

        Object readValue(int depth) throws ParseException {
            if (depth > MAX_DEPTH) throw new ParseException("aninhamento excessivo", pos);
            if (atEnd()) throw new ParseException("fim inesperado", pos);
            char c = text.charAt(pos);
            return switch (c) {
                case '{' -> readObject(depth);
                case '[' -> readArray(depth);
                case '"' -> readString();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> readNumber();
            };
        }

        private Object literal(String word, Object value) throws ParseException {
            if (!text.startsWith(word, pos)) throw new ParseException("valor inválido", pos);
            pos += word.length();
            return value;
        }

        private Map<String, Object> readObject(int depth) throws ParseException {
            pos++; // '{'
            Map<String, Object> map = new LinkedHashMap<>();
            skipWhitespace();
            if (peek('}')) {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                if (!peek('"')) throw new ParseException("chave deve ser texto", pos);
                String key = readString();
                skipWhitespace();
                expect(':');
                skipWhitespace();
                map.put(key, readValue(depth + 1));
                skipWhitespace();
                if (peek(',')) {
                    pos++;
                    continue;
                }
                expect('}');
                return map;
            }
        }

        private List<Object> readArray(int depth) throws ParseException {
            pos++; // '['
            List<Object> list = new ArrayList<>();
            skipWhitespace();
            if (peek(']')) {
                pos++;
                return list;
            }
            while (true) {
                skipWhitespace();
                list.add(readValue(depth + 1));
                skipWhitespace();
                if (peek(',')) {
                    pos++;
                    continue;
                }
                expect(']');
                return list;
            }
        }

        private String readString() throws ParseException {
            pos++; // '"'
            StringBuilder out = new StringBuilder();
            while (true) {
                if (atEnd()) throw new ParseException("texto não terminado", pos);
                char c = text.charAt(pos++);
                if (c == '"') return out.toString();
                if (c < 0x20) throw new ParseException("caractere de controle em texto", pos - 1);
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (atEnd()) throw new ParseException("escape incompleto", pos);
                char e = text.charAt(pos++);
                switch (e) {
                    case '"' -> out.append('"');
                    case '\\' -> out.append('\\');
                    case '/' -> out.append('/');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> {
                        if (pos + 4 > text.length()) throw new ParseException("escape \\u incompleto", pos);
                        try {
                            out.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16));
                        } catch (NumberFormatException ex) {
                            throw new ParseException("escape \\u inválido", pos);
                        }
                        pos += 4;
                    }
                    default -> throw new ParseException("escape inválido", pos - 1);
                }
            }
        }

        private Double readNumber() throws ParseException {
            int start = pos;
            while (pos < text.length() && "+-0123456789.eE".indexOf(text.charAt(pos)) >= 0) pos++;
            if (start == pos) throw new ParseException("valor inválido", pos);
            try {
                return Double.valueOf(text.substring(start, pos));
            } catch (NumberFormatException ex) {
                throw new ParseException("número inválido", start);
            }
        }

        private boolean peek(char c) {
            return pos < text.length() && text.charAt(pos) == c;
        }

        private void expect(char c) throws ParseException {
            if (!peek(c)) throw new ParseException("esperado '" + c + "'", pos);
            pos++;
        }
    }
}
