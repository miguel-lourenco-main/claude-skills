import java.io.IOException;
import java.lang.classfile.Annotation;
import java.lang.classfile.Attributes;
import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassModel;
import java.lang.classfile.CodeElement;
import java.lang.classfile.FieldModel;
import java.lang.classfile.MethodModel;
import java.lang.classfile.MethodSignature;
import java.lang.classfile.Signature;
import java.lang.classfile.attribute.InnerClassInfo;
import java.lang.classfile.constantpool.ClassEntry;
import java.lang.classfile.constantpool.MethodTypeEntry;
import java.lang.classfile.constantpool.NameAndTypeEntry;
import java.lang.classfile.constantpool.PoolEntry;
import java.lang.classfile.instruction.ExceptionCatch;
import java.lang.classfile.instruction.FieldInstruction;
import java.lang.classfile.instruction.InvokeInstruction;
import java.lang.classfile.instruction.LineNumber;
import java.lang.classfile.instruction.LocalVariable;
import java.lang.classfile.instruction.LocalVariableType;
import java.lang.classfile.instruction.NewObjectInstruction;
import java.lang.reflect.AccessFlag;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Reads compiled classes and writes every type and every type-to-type reference as JSON.
 *
 * Nothing here is inferred: each edge is a reference the compiler wrote into the class file.
 * Run with a JDK 24 or newer (it uses java.lang.classfile):
 *
 *   java Extract.java --classes target/classes --out graph.json
 *   java Extract.java --classes target/classes --classes target/test-classes=test --out graph.json
 *
 * A --classes argument is a directory or a jar, optionally followed by =label (default "main").
 */
public class Extract {

    static final int VIA_LIMIT = 8;
    static final Pattern CLASS_IN_DESCRIPTOR = Pattern.compile("L([^;<:.\\[()]+)[;<]");

    static final class Acc {
        int n;
        int line;
        final LinkedHashSet<String> via = new LinkedHashSet<>();
    }

    static final class Member {
        String name, type, params, vis;
        boolean isStatic, isAbstract, isFinal, ctor;
        int line;
        List<String> annotations = new ArrayList<>();
    }

    static final class Type {
        String id, name, pkg, kind, vis, outer, source, set, superExt;
        boolean isAbstract, isFinal, anonymous, local, synthetic, sealed;
        int line;
        List<String> ifaceExt = new ArrayList<>();
        List<String> annotations = new ArrayList<>();
        List<Member> fields = new ArrayList<>();
        List<Member> methods = new ArrayList<>();
        // target internal name -> kind -> accumulator
        Map<String, Map<String, Acc>> refs = new LinkedHashMap<>();
        // target -> wrapper type a field holds it in (java.util.List, [], ...), for multiplicity
        Map<String, String> fieldWrap = new LinkedHashMap<>();
    }

    public static void main(String[] args) throws Exception {
        List<String[]> roots = new ArrayList<>();
        String out = null;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--classes" -> {
                    String v = args[++i];
                    int eq = v.lastIndexOf('=');
                    roots.add(eq > 0 ? new String[] {v.substring(0, eq), v.substring(eq + 1)} : new String[] {v, "main"});
                }
                case "--out" -> out = args[++i];
                default -> fail("unknown argument: " + args[i]);
            }
        }
        if (roots.isEmpty() || out == null) fail("usage: java Extract.java --classes <dir|jar>[=label] ... --out graph.json");

        Map<String, Type> types = new TreeMap<>();
        for (String[] root : roots) {
            Path p = Path.of(root[0]);
            if (!Files.exists(p)) fail("no such classes root: " + p);
            if (Files.isDirectory(p)) {
                readTree(p, root[1], types);
            } else {
                try (FileSystem fs = FileSystems.newFileSystem(p)) {
                    for (Path r : fs.getRootDirectories()) readTree(r, root[1], types);
                }
            }
        }
        if (types.isEmpty()) fail("no .class files found under the given roots — compile the project first");

        StringBuilder sb = new StringBuilder(1 << 20);
        sb.append("{\n\"meta\":{\"extractor\":\"java-diagrams/Extract\",\"jdk\":").append(q(Runtime.version().toString()))
          .append(",\"roots\":[");
        for (int i = 0; i < roots.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"path\":").append(q(Path.of(roots.get(i)[0]).toAbsolutePath().normalize().toString())).append(",\"set\":").append(q(roots.get(i)[1])).append('}');
        }
        sb.append("],\"types\":").append(types.size()).append("},\n\"types\":[\n");
        boolean first = true;
        for (Type t : types.values()) {
            if (!first) sb.append(",\n");
            first = false;
            writeType(sb, t);
        }
        sb.append("\n],\n\"edges\":[\n");
        first = true;
        int edgeCount = 0;
        for (Type t : types.values()) {
            for (var e : t.refs.entrySet()) {
                String to = e.getKey().replace('/', '.');
                if (to.equals(t.id) || !types.containsKey(to)) continue;
                if (!first) sb.append(",\n");
                first = false;
                edgeCount++;
                sb.append("{\"from\":").append(q(t.id)).append(",\"to\":").append(q(to));
                String wrap = t.fieldWrap.get(e.getKey());
                if (wrap != null) sb.append(",\"wrap\":").append(q(wrap));
                sb.append(",\"kinds\":{");
                boolean fk = true;
                for (var k : e.getValue().entrySet()) {
                    if (!fk) sb.append(',');
                    fk = false;
                    Acc a = k.getValue();
                    sb.append(q(k.getKey())).append(":{\"n\":").append(a.n);
                    if (a.line > 0) sb.append(",\"line\":").append(a.line);
                    if (!a.via.isEmpty()) sb.append(",\"via\":").append(arr(a.via));
                    sb.append('}');
                }
                sb.append("}}");
            }
        }
        sb.append("\n]\n}\n");
        Files.writeString(Path.of(out), sb, StandardCharsets.UTF_8);
        System.out.println("types " + types.size() + "  edges " + edgeCount + "  -> " + out);
    }

    static void readTree(Path root, String set, Map<String, Type> types) throws IOException {
        try (Stream<Path> s = Files.walk(root)) {
            for (Path f : (Iterable<Path>) s.filter(x -> x.toString().endsWith(".class"))::iterator) {
                String fn = f.getFileName().toString();
                if (fn.equals("module-info.class") || fn.equals("package-info.class")) continue;
                Type t = read(Files.readAllBytes(f), set);
                types.putIfAbsent(t.id, t);
            }
        }
    }

    static Type read(byte[] bytes, String set) {
        ClassModel cm = ClassFile.of().parse(bytes);
        Type t = new Type();
        String internal = cm.thisClass().asInternalName();
        t.id = internal.replace('/', '.');
        t.set = set;
        int slash = internal.lastIndexOf('/');
        t.pkg = slash < 0 ? "" : internal.substring(0, slash).replace('/', '.');
        t.name = internal.substring(slash + 1);
        var flags = cm.flags();
        t.isAbstract = flags.has(AccessFlag.ABSTRACT);
        t.isFinal = flags.has(AccessFlag.FINAL);
        t.synthetic = flags.has(AccessFlag.SYNTHETIC);
        t.vis = flags.has(AccessFlag.PUBLIC) ? "public" : "package";
        t.kind = flags.has(AccessFlag.ANNOTATION) ? "annotation"
                : flags.has(AccessFlag.INTERFACE) ? "interface"
                : flags.has(AccessFlag.ENUM) ? "enum"
                : cm.findAttribute(Attributes.record()).isPresent() ? "record" : "class";
        cm.findAttribute(Attributes.sourceFile()).ifPresent(a -> t.source = a.sourceFile().stringValue());
        t.sealed = cm.findAttribute(Attributes.permittedSubclasses()).isPresent();

        // nesting
        cm.findAttribute(Attributes.innerClasses()).ifPresent(a -> {
            for (InnerClassInfo ic : a.classes()) {
                if (!ic.innerClass().asInternalName().equals(internal)) continue;
                if (ic.innerName().isEmpty()) t.anonymous = true;
                else t.name = ic.innerName().get().stringValue();
                ic.outerClass().ifPresent(o -> t.outer = o.asInternalName().replace('/', '.'));
                if (ic.has(AccessFlag.PRIVATE)) t.vis = "private";
                else if (ic.has(AccessFlag.PROTECTED)) t.vis = "protected";
                else if (ic.has(AccessFlag.PUBLIC)) t.vis = "public";
            }
        });
        cm.findAttribute(Attributes.enclosingMethod()).ifPresent(a -> {
            t.local = true;
            t.outer = a.enclosingClass().asInternalName().replace('/', '.');
        });
        if (t.outer == null && t.name.contains("$")) {
            // nest host is the outermost class; good enough when InnerClasses did not name an outer
            cm.findAttribute(Attributes.nestHost()).ifPresent(a -> t.outer = a.nestHost().asInternalName().replace('/', '.'));
        }

        // supertypes
        boolean isInterface = flags.has(AccessFlag.INTERFACE);
        cm.superclass().ifPresent(sc -> {
            String n = sc.asInternalName();
            if (n.equals("java/lang/Object") || n.equals("java/lang/Record") || n.equals("java/lang/Enum")) return;
            t.superExt = n.replace('/', '.');
            add(t, n, "extends", null, 0);
        });
        for (ClassEntry ie : cm.interfaces()) {
            String n = ie.asInternalName();
            t.ifaceExt.add(n.replace('/', '.'));
            add(t, n, isInterface ? "extends" : "implements", null, 0);
        }

        annotations(cm.findAttribute(Attributes.runtimeVisibleAnnotations()).map(a -> a.annotations()).orElse(List.of()), t, t.annotations, "@type");
        annotations(cm.findAttribute(Attributes.runtimeInvisibleAnnotations()).map(a -> a.annotations()).orElse(List.of()), t, t.annotations, "@type");

        // fields
        for (FieldModel f : cm.fields()) {
            String fname = f.fieldName().stringValue();
            String sigText = f.findAttribute(Attributes.signature()).map(a -> a.signature().stringValue())
                    .orElse(f.fieldType().stringValue());
            Signature sig = Signature.parseFrom(sigText);
            boolean synthetic = f.flags().has(AccessFlag.SYNTHETIC);
            String kind = synthetic ? "uses" : "field";
            collect(sig, null, (cls, wrap) -> {
                add(t, cls, kind, fname, 0);
                if (!synthetic) {
                    if (wrap == null) t.fieldWrap.put(cls, "");            // held directly at least once
                    else t.fieldWrap.putIfAbsent(cls, wrap);
                }
            });
            if (synthetic) continue;
            Member m = new Member();
            m.name = fname;
            m.type = pretty(sig);
            m.vis = vis(f.flags().has(AccessFlag.PUBLIC), f.flags().has(AccessFlag.PROTECTED), f.flags().has(AccessFlag.PRIVATE));
            m.isStatic = f.flags().has(AccessFlag.STATIC);
            m.isFinal = f.flags().has(AccessFlag.FINAL);
            annotations(f.findAttribute(Attributes.runtimeVisibleAnnotations()).map(a -> a.annotations()).orElse(List.of()), t, m.annotations, fname);
            t.fields.add(m);
        }

        // methods
        int minLine = Integer.MAX_VALUE;
        for (MethodModel mm : cm.methods()) {
            String mname = mm.methodName().stringValue();
            boolean hidden = mm.flags().has(AccessFlag.SYNTHETIC) || mm.flags().has(AccessFlag.BRIDGE);
            String sigText = mm.findAttribute(Attributes.signature()).map(a -> a.signature().stringValue())
                    .orElse(mm.methodType().stringValue());
            MethodSignature ms = MethodSignature.parseFrom(sigText);
            String display = mname.equals("<init>") ? t.name : mname;
            for (Signature a : ms.arguments()) collect(a, null, (cls, wrap) -> add(t, cls, hidden ? "uses" : "param", display, 0));
            collect(ms.result(), null, (cls, wrap) -> add(t, cls, hidden ? "uses" : "return", display, 0));
            mm.findAttribute(Attributes.exceptions()).ifPresent(a -> {
                for (ClassEntry ce : a.exceptions()) add(t, ce.asInternalName(), "throws", display, 0);
            });

            int[] firstLine = {0};
            int[] cur = {0};
            mm.code().ifPresent(code -> {
                for (CodeElement el : code) {
                    switch (el) {
                        case LineNumber ln -> {
                            cur[0] = ln.line();
                            if (firstLine[0] == 0 || ln.line() < firstLine[0]) firstLine[0] = ln.line();
                        }
                        case NewObjectInstruction i -> add(t, i.className().asInternalName(), "creates", display, cur[0]);
                        case InvokeInstruction i -> add(t, i.owner().asInternalName(), "calls",
                                display + "→" + i.name().stringValue(), cur[0]);
                        case FieldInstruction i -> add(t, i.owner().asInternalName(), "reads",
                                display + "→" + i.name().stringValue(), cur[0]);
                        case ExceptionCatch c -> c.catchType().ifPresent(ce -> add(t, ce.asInternalName(), "uses", display, cur[0]));
                        case LocalVariable lv -> scan(lv.type().stringValue(), t, display);
                        case LocalVariableType lv -> scan(lv.signature().stringValue(), t, display);
                        default -> { }
                    }
                }
            });
            if (firstLine[0] > 0 && firstLine[0] < minLine) minLine = firstLine[0];
            if (hidden || mname.equals("<clinit>")) continue;
            Member m = new Member();
            m.name = display;
            m.ctor = mname.equals("<init>");
            m.params = String.join(", ", ms.arguments().stream().map(Extract::pretty).toList());
            m.type = m.ctor ? null : pretty(ms.result());
            m.vis = vis(mm.flags().has(AccessFlag.PUBLIC), mm.flags().has(AccessFlag.PROTECTED), mm.flags().has(AccessFlag.PRIVATE));
            m.isStatic = mm.flags().has(AccessFlag.STATIC);
            m.isAbstract = mm.flags().has(AccessFlag.ABSTRACT);
            m.line = firstLine[0];
            annotations(mm.findAttribute(Attributes.runtimeVisibleAnnotations()).map(a -> a.annotations()).orElse(List.of()), t, m.annotations, display);
            t.methods.add(m);
        }
        t.line = minLine == Integer.MAX_VALUE ? 0 : minLine;

        // Catch-all: anything the constant pool names that no specific kind above accounted for
        // (casts, instanceof, class literals, lambdas, nest mates, permitted subclasses, ...).
        Set<String> pool = new LinkedHashSet<>();
        for (PoolEntry pe : cm.constantPool()) {
            switch (pe) {
                case ClassEntry ce -> {
                    String n = ce.asInternalName();
                    if (n.startsWith("[")) scanInto(n, pool); else pool.add(n);
                }
                case NameAndTypeEntry nt -> scanInto(nt.type().stringValue(), pool);
                case MethodTypeEntry mt -> scanInto(mt.descriptor().stringValue(), pool);
                default -> { }
            }
        }
        for (String n : pool) if (!t.refs.containsKey(n)) add(t, n, "uses", null, 0);
        return t;
    }

    static void annotations(List<Annotation> list, Type t, List<String> into, String via) {
        for (Annotation a : list) {
            String desc = a.className().stringValue();              // Lfoo/Bar;
            String internal = desc.substring(1, desc.length() - 1);
            into.add(internal.replace('/', '.'));
            add(t, internal, "annotated", via, 0);
        }
    }

    static void scan(String descriptor, Type t, String via) {
        Matcher m = CLASS_IN_DESCRIPTOR.matcher(descriptor);
        while (m.find()) add(t, m.group(1), "uses", via, 0);
    }

    static void scanInto(String descriptor, Set<String> into) {
        Matcher m = CLASS_IN_DESCRIPTOR.matcher(descriptor);
        while (m.find()) into.add(m.group(1));
    }

    static void add(Type t, String targetInternal, String kind, String via, int line) {
        if (targetInternal.startsWith("[")) {
            Matcher m = CLASS_IN_DESCRIPTOR.matcher(targetInternal);
            if (!m.find()) return;
            targetInternal = m.group(1);
        }
        Acc a = t.refs.computeIfAbsent(targetInternal, k -> new LinkedHashMap<>()).computeIfAbsent(kind, k -> new Acc());
        a.n++;
        if (via != null && a.via.size() < VIA_LIMIT) a.via.add(via);
        if (line > 0 && (a.line == 0 || line < a.line)) a.line = line;
    }

    interface Sink { void accept(String internalName, String wrapper); }

    /** Every class a signature names; wrapper is the enclosing generic type or "[]", null at top level. */
    static void collect(Signature s, String wrapper, Sink sink) {
        switch (s) {
            case Signature.ClassTypeSig c -> {
                String name = fullName(c);
                sink.accept(name, wrapper);
                for (Signature.TypeArg ta : allTypeArgs(c)) {
                    if (ta instanceof Signature.TypeArg.Bounded b) collect(b.boundType(), name.replace('/', '.'), sink);
                }
            }
            case Signature.ArrayTypeSig a -> collect(a.componentSignature(), "[]", sink);
            default -> { }
        }
    }

    static List<Signature.TypeArg> allTypeArgs(Signature.ClassTypeSig c) {
        List<Signature.TypeArg> all = new ArrayList<>(c.typeArgs());
        c.outerType().ifPresent(o -> all.addAll(allTypeArgs(o)));
        return all;
    }

    static String fullName(Signature.ClassTypeSig c) {
        return c.outerType().map(o -> fullName(o) + "$" + c.className()).orElse(c.className());
    }

    static String pretty(Signature s) {
        return switch (s) {
            case Signature.BaseTypeSig b -> switch (b.baseType()) {
                case 'Z' -> "boolean"; case 'B' -> "byte"; case 'C' -> "char"; case 'S' -> "short";
                case 'I' -> "int"; case 'J' -> "long"; case 'F' -> "float"; case 'D' -> "double";
                default -> "void";
            };
            case Signature.TypeVarSig v -> v.identifier();
            case Signature.ArrayTypeSig a -> pretty(a.componentSignature()) + "[]";
            case Signature.ClassTypeSig c -> {
                String n = fullName(c);
                n = n.substring(n.lastIndexOf('/') + 1).replace('$', '.');
                if (c.typeArgs().isEmpty()) yield n;
                List<String> parts = new ArrayList<>();
                for (Signature.TypeArg ta : c.typeArgs()) {
                    parts.add(switch (ta) {
                        case Signature.TypeArg.Unbounded u -> "?";
                        case Signature.TypeArg.Bounded b -> switch (b.wildcardIndicator()) {
                            case NONE -> pretty(b.boundType());
                            case EXTENDS -> "? extends " + pretty(b.boundType());
                            case SUPER -> "? super " + pretty(b.boundType());
                        };
                    });
                }
                yield n + "<" + String.join(", ", parts) + ">";
            }
        };
    }

    static String vis(boolean pub, boolean prot, boolean priv) {
        return pub ? "public" : prot ? "protected" : priv ? "private" : "package";
    }

    static void writeType(StringBuilder sb, Type t) {
        sb.append("{\"id\":").append(q(t.id)).append(",\"name\":").append(q(t.name)).append(",\"pkg\":").append(q(t.pkg))
          .append(",\"kind\":").append(q(t.kind)).append(",\"vis\":").append(q(t.vis)).append(",\"set\":").append(q(t.set));
        if (t.isAbstract && !t.kind.equals("interface") && !t.kind.equals("annotation")) sb.append(",\"abstract\":true");
        if (t.isFinal) sb.append(",\"final\":true");
        if (t.sealed) sb.append(",\"sealed\":true");
        if (t.anonymous) sb.append(",\"anonymous\":true");
        if (t.local) sb.append(",\"local\":true");
        if (t.synthetic) sb.append(",\"synthetic\":true");
        if (t.outer != null) sb.append(",\"outer\":").append(q(t.outer));
        if (t.source != null) sb.append(",\"source\":").append(q(t.source));
        if (t.line > 0) sb.append(",\"line\":").append(t.line);
        if (t.superExt != null) sb.append(",\"super\":").append(q(t.superExt));
        if (!t.ifaceExt.isEmpty()) sb.append(",\"interfaces\":").append(arr(t.ifaceExt));
        if (!t.annotations.isEmpty()) sb.append(",\"annotations\":").append(arr(t.annotations));
        sb.append(",\"fields\":[");
        for (int i = 0; i < t.fields.size(); i++) {
            Member m = t.fields.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"name\":").append(q(m.name)).append(",\"type\":").append(q(m.type)).append(",\"vis\":").append(q(m.vis));
            if (m.isStatic) sb.append(",\"static\":true");
            if (m.isFinal) sb.append(",\"final\":true");
            if (!m.annotations.isEmpty()) sb.append(",\"annotations\":").append(arr(m.annotations));
            sb.append('}');
        }
        sb.append("],\"methods\":[");
        for (int i = 0; i < t.methods.size(); i++) {
            Member m = t.methods.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"name\":").append(q(m.name)).append(",\"params\":").append(q(m.params)).append(",\"vis\":").append(q(m.vis));
            if (m.type != null) sb.append(",\"type\":").append(q(m.type));
            if (m.ctor) sb.append(",\"ctor\":true");
            if (m.isStatic) sb.append(",\"static\":true");
            if (m.isAbstract) sb.append(",\"abstract\":true");
            if (m.line > 0) sb.append(",\"line\":").append(m.line);
            if (!m.annotations.isEmpty()) sb.append(",\"annotations\":").append(arr(m.annotations));
            sb.append('}');
        }
        sb.append("]}");
    }

    static String arr(Iterable<String> items) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (String s : items) {
            if (!first) sb.append(',');
            first = false;
            sb.append(q(s));
        }
        return sb.append(']').toString();
    }

    static String q(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> { if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
            }
        }
        return sb.append('"').toString();
    }

    static void fail(String msg) {
        System.err.println(msg);
        System.exit(2);
    }
}
