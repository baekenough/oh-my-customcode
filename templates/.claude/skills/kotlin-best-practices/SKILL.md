---
name: kotlin-best-practices
description: Idiomatic Kotlin patterns from JetBrains conventions
user-invocable: false
---

## Purpose

Apply idiomatic Kotlin patterns and best practices from official JetBrains documentation.

## Core Principles

```
Concise yet readable
Null safety by design
Interoperability with Java
Functional when appropriate
```

## Rules

### 1. Naming Conventions

```yaml
packages:
  style: lowercase, no underscores
  example: org.example.project

classes_objects:
  style: UpperCamelCase
  example: DeclarationProcessor

functions_variables:
  style: lowerCamelCase
  example: processDeclarations, declarationCount

constants:
  style: SCREAMING_SNAKE_CASE
  example: const val MAX_COUNT = 8

backing_properties:
  style: underscore prefix
  example: private val _elementList

acronyms:
  two_letters: both uppercase (IOStream)
  three_plus: capitalize first only (XmlFormatter)
```

### 2. Source File Organization

```yaml
file_naming:
  single_class: name after the class (MyClass.kt)
  multiple_classes: descriptive UpperCamelCase (ProcessDeclarations.kt)
  platform_specific: add suffix (Platform.jvm.kt)

class_layout:
  1: Property declarations and initializer blocks
  2: Secondary constructors
  3: Method declarations
  4: Companion object

directory_structure:
  - Follow package structure with common root omitted
  - Example: org.example.kotlin.network → network/
```

### 3. Formatting

```yaml
indentation:
  - 4 spaces (no tabs)
  - Opening brace at end of line
  - Closing brace on separate line

horizontal_whitespace:
  around_binary_operators: "a + b"
  no_around_range: "0..i"
  no_around_unary: "a++"
  after_control_keywords: "if (condition)"
  no_before_parentheses: "method()"
  never_around_dot: "foo.bar()"

colons:
  type_supertype: "class Foo : Bar"
  declaration_type: "val x: Int"
  always_space_after: true

trailing_commas:
  recommended: true
  reason: cleaner diffs, easier reordering
```

### 4. Functions

```yaml
expression_bodies:
  prefer: "fun foo() = 1"
  over: |
    fun foo(): Int {
        return 1
    }

default_parameters:
  prefer: "fun foo(a: String = \"a\")"
  over: overloaded functions

single_line_signatures:
  if_fits: "fun foo(a: Int): String = ..."
  otherwise: |
    fun longMethodName(
        argument: ArgumentType = defaultValue,
        argument2: AnotherArgumentType,
    ): ReturnType { }

unit_return:
  avoid: "fun foo(): Unit { }"
  prefer: "fun foo() { }"
```

### 5. Null Safety

```yaml
principles:
  - Prefer non-null types by default
  - Use ? only when nullability is meaningful
  - Leverage safe calls (?.) and elvis (?:)

patterns: |
  // Safe call
  val length = text?.length

  // Elvis operator
  val name = user?.name ?: "Anonymous"

  // Let for null checks
  user?.let {
      println(it.name)
  }

  // Not-null assertion (use sparingly)
  val name = user!!.name
```

### 6. Idiomatic Patterns

```yaml
immutability:
  prefer: "val over var"
  collections: "listOf() over arrayListOf()"

conditionals:
  binary: use if
  multiple: use when

  patterns: |
    // if expression
    return if (x) foo() else bar()

    // when expression
    return when(x) {
        0 -> "zero"
        else -> "nonzero"
    }

functional:
  prefer: "list.filter { it > 10 }.map { it * 2 }"
  over: manual loops (except forEach)

ranges:
  prefer: "for (i in 0..<n)"
  avoid: "for (i in 0..n - 1)"

type_aliases:
  use_for: |
    typealias MouseClickHandler = (Any, MouseEvent) -> Unit
    typealias PersonIndex = Map<String, Person>
```

### 7. Lambdas

```yaml
formatting:
  - Spaces around curly braces: "list.filter { it > 10 }"
  - Single lambda outside parentheses
  - it for single parameter

patterns: |
  // Outside parentheses
  list.filter { it > 10 }

  // Multiple parameters
  list.fold(0) { acc, item -> acc + item }

  // Destructuring
  map.forEach { (key, value) -> println("$key = $value") }
```

### 8. Coroutines

```yaml
principles:
  - Use suspend functions for async operations
  - Structured concurrency with scopes
  - Proper exception handling

patterns: |
  // Suspend function
  suspend fun fetchData(): Data {
      return withContext(Dispatchers.IO) {
          api.getData()
      }
  }

  // Coroutine scope
  lifecycleScope.launch {
      val data = fetchData()
      updateUI(data)
  }

  // Exception handling
  try {
      val result = async { fetchData() }.await()
  } catch (e: Exception) {
      handleError(e)
  }
```

### 9. Documentation

```yaml
format: |
  /**
   * Returns the absolute value of the given [number].
   */
  fun abs(number: Int): Int { ... }

best_practices:
  - Incorporate parameters into description
  - Use brackets for parameter references
  - Use @param/@return only for lengthy descriptions
```

## Application

When writing or reviewing Kotlin code:

1. **Always** prefer val over var
2. **Always** use null-safe types appropriately
3. **Prefer** expression bodies for simple functions
4. **Prefer** functional operations over loops
5. **Use** default parameters over overloads
6. **Use** when for multiple conditions
7. **Leverage** extension functions
8. **Document** public APIs
