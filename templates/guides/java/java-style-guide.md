# Java Style Guide

> Source: https://google.github.io/styleguide/javaguide.html

## File Structure

```
Source file:
  1. License/copyright (if any)
  2. Package statement
  3. Import statements
  4. Exactly one top-level class
```

### Import Ordering

```java
// 1. Static imports (all together)
import static org.junit.Assert.assertEquals;

// 2. Non-static imports (all together, no subgroups)
import com.example.Foo;
import java.util.List;
import org.springframework.boot.SpringApplication;
```

No wildcard imports except `static` test imports.

---

## Naming Conventions

| Element | Style | Example |
|---------|-------|---------|
| Packages | `lowercase` | `com.example.network` |
| Classes | `UpperCamelCase` | `OrderProcessor` |
| Records | `UpperCamelCase` | `UserRecord` |
| Methods | `lowerCamelCase` | `processOrder()` |
| Local vars | `lowerCamelCase` | `itemCount` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| Type params | Single letter or `UpperCamelCase + T` | `T`, `E`, `RequestT` |

### Acronyms

Treat acronyms as words: `XmlParser`, not `XMLParser`. Exception: well-known 2-letter ones like `IO`.

---

## Formatting

### Indentation

- 2 spaces (not tabs) for block indentation
- 4 spaces for line continuation

```java
// Block indentation: 2 spaces
if (condition) {
  doSomething();
}

// Line continuation: 4 spaces
String result = longMethodName(
    argument1,
    argument2);
```

### Braces

Always use braces, even for single-statement bodies:

```java
// Correct
if (condition) {
  doSomething();
}

// Wrong (no braces)
if (condition)
  doSomething();
```

### Column Limit

100 characters per line. Wrap when exceeding.

### Blank Lines

```java
class MyClass {
  private int field;          // field
                              // one blank line
  public MyClass() { }        // constructor
                              // one blank line
  public void method() { }    // method
}
```

---

## Class Structure

```java
public class MyClass {
  // 1. Static fields
  private static final Logger log = LoggerFactory.getLogger(MyClass.class);

  // 2. Instance fields
  private final String name;

  // 3. Constructors
  public MyClass(String name) {
    this.name = name;
  }

  // 4. Static factory methods (if applicable)
  public static MyClass of(String name) {
    return new MyClass(name);
  }

  // 5. Instance methods (public → package → protected → private)
  public String getName() { return name; }

  private void helper() { }

  // 6. Inner classes/interfaces (last)
}
```

---

## Programming Practices

### Annotations

```java
// One annotation per line for class/method
@Override
@Nullable
public String format(String input) { }

// Multiple short annotations on one line for field is OK
@Nullable @Deprecated String field;
```

### Numeric Literals

```java
long big = 1_000_000L;
double pi = 3.14_159;
int hex = 0xFF_EC_D1_8C;
```

### Switch Expressions (prefer over statements)

```java
// Prefer switch expression
int days = switch (month) {
  case JANUARY, MARCH, MAY, JULY, AUGUST, OCTOBER, DECEMBER -> 31;
  case APRIL, JUNE, SEPTEMBER, NOVEMBER -> 30;
  case FEBRUARY -> 28;
};
```

### Avoid Long Methods

Keep methods short and focused. Extract helpers for blocks exceeding ~20 lines.

---

## Javadoc

### Required for

- Every `public` class, interface, enum, record
- Every `public` or `protected` method (unless trivially obvious)

### Format

```java
/**
 * Returns the user associated with the given ID.
 *
 * <p>This method performs a database lookup. It is safe to call
 * from multiple threads.
 *
 * @param id the user identifier (must be positive)
 * @return the user, or empty if not found
 * @throws IllegalArgumentException if {@code id <= 0}
 */
public Optional<User> findById(long id) { }
```

### Inline Tags

```java
/**
 * See {@link UserRepository} for persistence details.
 * Use {@code null} to reset the state.
 */
```

### Prohibited: Non-Javadoc Comments for API

```java
// Wrong: plain comment for public method
// Returns the user by id
public Optional<User> findById(long id) { }

// Correct: Javadoc
/** Returns the user by id, or empty if not found. */
public Optional<User> findById(long id) { }
```

---

## Common Antipatterns to Avoid

```java
// ❌ Raw types
List list = new ArrayList();
// ✓
List<String> list = new ArrayList<>();

// ❌ String concatenation in loop
String s = "";
for (String item : items) s += item;
// ✓
StringBuilder sb = new StringBuilder();
for (String item : items) sb.append(item);
String s = sb.toString();

// ❌ Return null for collections
public List<String> getItems() { return null; }
// ✓
public List<String> getItems() { return Collections.emptyList(); }

// ❌ Catch Exception broadly
try { process(); } catch (Exception e) { }
// ✓
try { process(); } catch (IOException e) { log.error("IO error", e); }

// ❌ Mutable public field
public String name;
// ✓
private String name;
public String getName() { return name; }
```
