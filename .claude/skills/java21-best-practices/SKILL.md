---
name: java21-best-practices
description: Modern Java 21 patterns from Virtual Threads, Pattern Matching, Records, and Sealed Classes
user-invocable: false
---

## Purpose

Apply modern Java 21 patterns and best practices leveraging the latest language features for clean, performant, and maintainable Java code.

## Core Principles

```
Embrace modern Java features over legacy patterns
Prefer immutability and data-centric design
Leverage Virtual Threads for scalable concurrency
Use Pattern Matching for expressive type handling
```

## Rules

### 1. Naming Conventions (Google Java Style)

```yaml
packages:
  style: lowercase, no underscores
  example: com.example.project

classes:
  style: UpperCamelCase
  example: OrderProcessor, UserRecord

methods_variables:
  style: lowerCamelCase
  example: processOrder(), itemCount

constants:
  style: UPPER_SNAKE_CASE
  example: static final int MAX_RETRIES = 3

records:
  style: UpperCamelCase (same as class)
  example: record Point(int x, int y) {}
```

### 2. Virtual Threads (JEP 444)

```yaml
principles:
  - Use Virtual Threads for I/O-bound tasks
  - Avoid pooling Virtual Threads (they are lightweight)
  - Replace thread pools for blocking I/O with Virtual Thread executors

patterns: |
  // Preferred: Virtual Thread executor
  try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      Future<String> result = executor.submit(() -> fetchFromDB());
      System.out.println(result.get());
  }

  // Direct creation
  Thread vThread = Thread.ofVirtual().start(() -> {
      // blocking I/O is fine here
      String data = callExternalApi();
      process(data);
  });

  // With structured concurrency (JEP 453, preview)
  try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
      Future<String> user = scope.fork(() -> fetchUser(id));
      Future<List<Order>> orders = scope.fork(() -> fetchOrders(id));
      scope.join().throwIfFailed();
      return new UserProfile(user.get(), orders.get());
  }

antipatterns:
  - "Executors.newFixedThreadPool() for I/O tasks — use Virtual Threads instead"
  - "Thread.sleep() on platform threads for rate limiting — use Virtual Threads"
  - "synchronized blocks in Virtual Thread code — use ReentrantLock instead"
```

### 3. Pattern Matching

```yaml
instanceof_patterns: |
  // Old style (avoid)
  if (obj instanceof String) {
      String s = (String) obj;
      System.out.println(s.length());
  }

  // New style (prefer)
  if (obj instanceof String s) {
      System.out.println(s.length());
  }

  // With guard
  if (obj instanceof String s && s.length() > 5) {
      System.out.println("Long string: " + s);
  }

switch_patterns: |
  // Pattern matching for switch (JEP 441)
  String result = switch (obj) {
      case Integer i -> "int " + i;
      case String s  -> "str " + s;
      case null      -> "null";
      default        -> "other " + obj;
  };

  // With guards (when clause)
  String label = switch (shape) {
      case Circle c when c.radius() > 10 -> "large circle";
      case Circle c                       -> "small circle";
      case Rectangle r                    -> "rectangle";
      default                             -> "unknown";
  };
```

### 4. Records (JEP 395)

```yaml
principles:
  - Use Records for immutable data carriers
  - Prefer Records over POJOs with getters/setters for pure data
  - Compact constructors for validation

patterns: |
  // Basic record
  record Point(int x, int y) {}

  // With validation (compact constructor)
  record Range(int min, int max) {
      Range {
          if (min > max) throw new IllegalArgumentException(
              "min %d > max %d".formatted(min, max));
      }
  }

  // With custom methods
  record Circle(double radius) {
      double area() {
          return Math.PI * radius * radius;
      }
  }

  // Implementing interface
  interface Shape { double area(); }
  record Square(double side) implements Shape {
      public double area() { return side * side; }
  }

antipatterns:
  - "Mutable state in records — records are inherently immutable"
  - "Using records for entities with behavior — prefer classes"
```

### 5. Record Patterns (JEP 440)

```yaml
patterns: |
  // Deconstruct record in instanceof
  if (obj instanceof Point(int x, int y)) {
      System.out.println("x=" + x + ", y=" + y);
  }

  // In switch
  String describe = switch (shape) {
      case Circle(double r)        -> "circle r=" + r;
      case Rectangle(double w, double h) -> "rect " + w + "x" + h;
      default -> "unknown";
  };

  // Nested record patterns
  record ColoredPoint(Point point, Color color) {}
  if (obj instanceof ColoredPoint(Point(int x, int y), Color c)) {
      System.out.println("colored point at " + x + "," + y);
  }
```

### 6. Sealed Classes (JEP 409)

```yaml
principles:
  - Use Sealed Classes for closed type hierarchies
  - Combine with Pattern Matching switch for exhaustive handling
  - Prefer sealed interfaces for behavior-focused hierarchies

patterns: |
  // Sealed interface with records
  sealed interface Shape permits Circle, Rectangle, Triangle {}
  record Circle(double radius) implements Shape {}
  record Rectangle(double width, double height) implements Shape {}
  record Triangle(double base, double height) implements Shape {}

  // Exhaustive switch (no default needed)
  double area = switch (shape) {
      case Circle(double r)             -> Math.PI * r * r;
      case Rectangle(double w, double h) -> w * h;
      case Triangle(double b, double h)  -> 0.5 * b * h;
  };
```

### 7. Sequenced Collections (JEP 431)

```yaml
principles:
  - Use SequencedCollection for ordered access
  - getFirst()/getLast() replace get(0) and get(size-1)

patterns: |
  // SequencedCollection methods
  List<String> list = new ArrayList<>(List.of("a", "b", "c"));
  String first = list.getFirst(); // "a"
  String last  = list.getLast();  // "c"
  list.addFirst("z");             // ["z", "a", "b", "c"]
  list.addLast("end");            // ["z", "a", "b", "c", "end"]

  // Reversed view
  List<String> reversed = list.reversed();

  // SequencedMap
  SequencedMap<String, Integer> map = new LinkedHashMap<>();
  map.put("one", 1);
  map.put("two", 2);
  Map.Entry<String, Integer> firstEntry = map.firstEntry(); // "one"=1
```

### 8. Text Blocks and String Features

```yaml
patterns: |
  // Text blocks (since Java 15)
  String json = """
      {
          "name": "Alice",
          "age": 30
      }
      """;

  // String.formatted() (since Java 15)
  String msg = "Hello, %s! You are %d years old.".formatted(name, age);

  // String templates (JEP 430, preview in Java 21)
  // Prefer String.formatted() or MessageFormat for now
```

### 9. Error Handling

```yaml
principles:
  - Prefer checked exceptions for recoverable conditions
  - Use unchecked exceptions for programming errors
  - Never swallow exceptions silently
  - Use specific exception types

patterns: |
  // Specific exception type
  public User findUser(long id) {
      return userRepository.findById(id)
          .orElseThrow(() -> new UserNotFoundException("User not found: " + id));
  }

  // Multi-catch
  try {
      process();
  } catch (IOException | SQLException e) {
      log.error("Data access failed", e);
      throw new ServiceException("Processing failed", e);
  }
```

### 10. Documentation

```yaml
format: |
  /**
   * Processes the given {@link Order} and returns a {@link Receipt}.
   *
   * @param order the order to process (must not be null)
   * @return the generated receipt
   * @throws OrderException if the order cannot be fulfilled
   */
  public Receipt processOrder(Order order) { }

best_practices:
  - Use @param and @return for public API
  - Link related types with {@link}
  - Document checked exceptions with @throws
  - Keep Javadoc focused on "what", not "how"
```

## Application

When writing or reviewing Java 21 code:

1. **Use** Records for pure data classes over verbose POJOs
2. **Use** Sealed Classes + Pattern Matching for type hierarchies
3. **Use** Virtual Threads for I/O-bound concurrency
4. **Use** `instanceof` pattern matching over explicit casts
5. **Prefer** switch expressions over switch statements
6. **Use** `getFirst()`/`getLast()` for sequenced collections
7. **Write** exhaustive switch for sealed types (no default)
8. **Document** public APIs with proper Javadoc
