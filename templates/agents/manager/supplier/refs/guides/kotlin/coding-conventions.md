# Kotlin Coding Conventions

> Source: https://kotlinlang.org/docs/coding-conventions.html

## Source Code Organization

### Directory Structure

Follow package structure with common root omitted:
- `org.example.kotlin.network.socket` → `network/socket` subdirectory

### Source File Names

| Content | File Name |
|---------|-----------|
| Single class | `MyClass.kt` |
| Multiple declarations | `ProcessDeclarations.kt` |
| Platform-specific | `Platform.jvm.kt` |

### Class Layout

1. Property declarations and initializer blocks
2. Secondary constructors
3. Method declarations
4. Companion object

```kotlin
class MyClass(val name: String) {
    // 1. Properties
    private val items = mutableListOf<Item>()

    init {
        // initializer block
    }

    // 2. Secondary constructors
    constructor() : this("default")

    // 3. Methods
    fun doSomething() { }

    // 4. Companion object
    companion object {
        const val TAG = "MyClass"
    }
}
```

## Naming Conventions

| Element | Style | Example |
|---------|-------|---------|
| Packages | lowercase | `org.example.project` |
| Classes | UpperCamelCase | `DeclarationProcessor` |
| Functions | lowerCamelCase | `processDeclarations()` |
| Properties | lowerCamelCase | `declarationCount` |
| Constants | UPPER_SNAKE_CASE | `MAX_COUNT` |
| Backing properties | underscore prefix | `_elementList` |

### Acronyms

- 2 letters: both uppercase (`IOStream`)
- 3+ letters: capitalize first only (`XmlFormatter`)

## Formatting

### Indentation

```kotlin
if (elements != null) {
    for (element in elements) {
        // 4 spaces indentation
    }
}
```

### Horizontal Whitespace

```kotlin
// Binary operators with spaces
val sum = a + b

// No space around range
for (i in 0..n) { }

// No space around dot
foo.bar().filter { it > 2 }

// Space after control keywords
if (condition) { }
```

### Colons

```kotlin
// Type and supertype: space before
abstract class Foo<out T : Any> : IFoo {
    // Declaration and type: no space before
    abstract fun foo(a: Int): T
}
```

### Function Signatures

```kotlin
// Short: single line
fun foo(a: Int): String = a.toString()

// Long: break parameters
fun longMethodName(
    argument: ArgumentType = defaultValue,
    argument2: AnotherArgumentType,
): ReturnType {
    // body
}
```

### Trailing Commas

```kotlin
class Person(
    val firstName: String,
    val lastName: String,
    val age: Int, // trailing comma
)
```

## Idiomatic Patterns

### Immutability

```kotlin
// Prefer val
val name = "Kotlin"

// Prefer immutable collections
val items = listOf(1, 2, 3)
```

### Default Parameters

```kotlin
// Prefer over overloads
fun read(
    b: ByteArray,
    off: Int = 0,
    len: Int = b.size,
) { }
```

### Expression Bodies

```kotlin
// Prefer for simple functions
fun square(x: Int) = x * x
```

### Conditionals

```kotlin
// Use if for binary
return if (x) foo() else bar()

// Use when for multiple
return when (x) {
    0 -> "zero"
    1 -> "one"
    else -> "many"
}
```

### Functional Operations

```kotlin
// Prefer
list.filter { it > 10 }
    .map { it * 2 }
    .take(5)

// Over manual loops
```

### Ranges

```kotlin
// Good: open-ended range
for (i in 0..<n) { }

// Avoid
for (i in 0..n - 1) { }
```

## Null Safety

```kotlin
// Safe call
val length = text?.length

// Elvis operator
val name = user?.name ?: "Unknown"

// Let for non-null
user?.let {
    println("Hello, ${it.name}")
}

// Not-null assertion (use sparingly)
val name = user!!.name
```

## Documentation

```kotlin
/**
 * Returns the absolute value of the given [number].
 */
fun abs(number: Int): Int = if (number < 0) -number else number

/**
 * A group of *members*.
 *
 * This class has no useful logic; it's just a documentation example.
 *
 * @property name the name of this group.
 * @constructor Creates an empty group.
 */
class Group(val name: String) {
    /**
     * Adds a [member] to this group.
     * @return the new size of the group.
     */
    fun add(member: Member): Int { ... }
}
```

## Avoid Redundant Constructs

```kotlin
// Avoid explicit Unit return
fun foo() { } // not: fun foo(): Unit { }

// Avoid semicolons
val x = 1 // not: val x = 1;

// Use simple string templates
"$name" // not: "${name}"
```
