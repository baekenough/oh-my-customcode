# Modern Java 21 Features

> Sources: https://openjdk.org/jeps/ (JEP 431, 440, 441, 444)

## Virtual Threads (JEP 444)

Virtual Threads are lightweight threads managed by the JVM, enabling millions of concurrent tasks without thread pool tuning.

### Key Properties

| Property | Platform Thread | Virtual Thread |
|----------|----------------|----------------|
| Creation cost | High (OS thread) | Low (JVM-managed) |
| Memory footprint | ~1MB per thread | ~few KB |
| Blocking behavior | Blocks OS thread | Unmounts carrier thread |
| Pooling | Needed | Not recommended |

### Usage

```java
// Virtual Thread executor (preferred for I/O-bound tasks)
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<String>> futures = IntStream.range(0, 10_000)
        .mapToObj(i -> executor.submit(() -> fetchData(i)))
        .toList();
    // all 10,000 tasks run concurrently
}

// Direct creation
Thread.ofVirtual().name("vt-worker").start(() -> processRequest());

// Factory for thread pools
ThreadFactory factory = Thread.ofVirtual().name("worker-", 0).factory();
```

### Structured Concurrency (JEP 453, Preview)

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Future<String> user   = scope.fork(() -> fetchUser(id));
    Future<String> orders = scope.fork(() -> fetchOrders(id));

    scope.join().throwIfFailed();

    return new UserProfile(user.get(), orders.get());
}
```

### Pinning Avoidance

Virtual Threads are **pinned** (cannot unmount) inside `synchronized` blocks. Prefer `ReentrantLock`:

```java
// Avoid (causes pinning)
synchronized (lock) {
    callBlockingIO();
}

// Prefer
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    callBlockingIO();
} finally {
    lock.unlock();
}
```

---

## Pattern Matching for instanceof (JEP 394)

```java
// Before Java 16
if (obj instanceof String) {
    String s = (String) obj;
    return s.length();
}

// Java 21
if (obj instanceof String s) {
    return s.length();
}

// With guard
if (obj instanceof String s && !s.isEmpty()) {
    return s.toUpperCase();
}
```

---

## Pattern Matching for switch (JEP 441)

```java
// Type patterns
String format = switch (obj) {
    case Integer i -> String.format("int %d", i);
    case Double d  -> String.format("double %.2f", d);
    case String s  -> String.format("String '%s'", s);
    case null      -> "null value";
    default        -> obj.toString();
};

// Guarded patterns (when clause)
String classify = switch (number) {
    case Integer i when i < 0  -> "negative";
    case Integer i when i == 0 -> "zero";
    case Integer i             -> "positive";
    default -> "non-integer";
};
```

---

## Record Classes (JEP 395)

Records are immutable data carriers with auto-generated `equals`, `hashCode`, `toString`, and accessors.

```java
// Basic record
record Point(int x, int y) {}

Point p = new Point(3, 4);
int x = p.x(); // accessor (not getX())
System.out.println(p); // Point[x=3, y=4]

// Compact constructor (validation)
record Range(int min, int max) {
    Range {
        if (min > max)
            throw new IllegalArgumentException(
                "min %d > max %d".formatted(min, max));
    }
}

// Custom methods
record Circle(double radius) {
    static final double PI = Math.PI;

    double area() { return PI * radius * radius; }

    Circle scale(double factor) { return new Circle(radius * factor); }
}

// Implementing interface
interface Describable { String describe(); }
record Color(int r, int g, int b) implements Describable {
    public String describe() {
        return "rgb(%d,%d,%d)".formatted(r, g, b);
    }
}
```

### When to Use Records vs Classes

| Use Record | Use Class |
|------------|-----------|
| Pure data containers | Entities with mutable state |
| DTOs, value objects | Domain objects with lifecycle |
| API response types | Services, repositories |
| Config/settings | Mutable builders |

---

## Record Patterns (JEP 440)

Deconstruct records directly in `instanceof` and `switch`:

```java
// instanceof deconstruction
if (obj instanceof Point(int x, int y)) {
    System.out.println("x=" + x + ", y=" + y);
}

// switch deconstruction
String describe = switch (shape) {
    case Circle(double r)             -> "circle r=%.2f".formatted(r);
    case Rectangle(double w, double h) -> "rect %.1fx%.1f".formatted(w, h);
    default -> "unknown";
};

// Nested patterns
record ColoredPoint(Point point, Color color) {}

if (obj instanceof ColoredPoint(Point(int x, int y), Color(int r, int g, int b))) {
    System.out.printf("Colored point at (%d,%d) with rgb(%d,%d,%d)%n",
        x, y, r, g, b);
}
```

---

## Sealed Classes (JEP 409)

Sealed classes restrict which classes can implement/extend them, enabling exhaustive pattern matching.

```java
// Sealed interface with records
sealed interface Shape permits Circle, Rectangle, Triangle {}

record Circle(double radius) implements Shape {}
record Rectangle(double width, double height) implements Shape {}
record Triangle(double base, double height) implements Shape {}

// Exhaustive switch — no default needed
double area = switch (shape) {
    case Circle(double r)             -> Math.PI * r * r;
    case Rectangle(double w, double h) -> w * h;
    case Triangle(double b, double h)  -> 0.5 * b * h;
};

// Sealed class hierarchy (non-record)
sealed class Vehicle permits Car, Truck, Motorcycle {}
final class Car extends Vehicle { }
non-sealed class Truck extends Vehicle { } // allows further subclassing
```

### Benefits

- Compiler enforces exhaustive handling in `switch`
- Clear closed type hierarchy in domain model
- Better than `enum` when subtypes carry different data

---

## Sequenced Collections (JEP 431)

New interfaces: `SequencedCollection`, `SequencedSet`, `SequencedMap`.

```java
// SequencedCollection
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
String first = list.getFirst(); // "a"
String last  = list.getLast();  // "c"
list.addFirst("z");             // ["z", "a", "b", "c"]
list.addLast("end");            // ["z", "a", "b", "c", "end"]
list.removeFirst();             // ["a", "b", "c", "end"]

// Reversed view (live, backed by original)
List<String> reversed = list.reversed();

// SequencedMap
LinkedHashMap<String, Integer> map = new LinkedHashMap<>();
map.put("one", 1);
map.put("two", 2);
map.put("three", 3);

Map.Entry<String, Integer> first = map.firstEntry(); // "one"=1
Map.Entry<String, Integer> last  = map.lastEntry();  // "three"=3
map.putFirst("zero", 0);       // inserts at front
SequencedMap<String, Integer> rev = map.reversed();
```

---

## Migration from Legacy Java

### Replace instanceof chains

```java
// Legacy (avoid)
if (obj instanceof String) {
    return ((String) obj).length();
} else if (obj instanceof Integer) {
    return ((Integer) obj).intValue();
}

// Modern
return switch (obj) {
    case String s  -> s.length();
    case Integer i -> i;
    default -> -1;
};
```

### Replace POJOs with Records

```java
// Legacy POJO (avoid for pure data)
public class Point {
    private final int x, y;
    public Point(int x, int y) { this.x = x; this.y = y; }
    public int getX() { return x; }
    public int getY() { return y; }
    @Override public boolean equals(Object o) { ... }
    @Override public int hashCode() { ... }
    @Override public String toString() { ... }
}

// Modern Record
record Point(int x, int y) {}
```

### Replace thread pools for I/O with Virtual Threads

```java
// Legacy (avoid for I/O-bound)
ExecutorService pool = Executors.newFixedThreadPool(200);

// Modern
ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
```
