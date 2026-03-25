# Kotlin Idioms

> Source: https://kotlinlang.org/docs/idioms.html

## Data Classes

```kotlin
data class Customer(val name: String, val email: String)
```

Provides:
- `equals()` / `hashCode()`
- `toString()`: `"Customer(name=John, email=john@example.com)"`
- `copy()` function
- `componentN()` functions

## Default Parameter Values

```kotlin
fun foo(a: Int = 0, b: String = "") { }
```

## Filtering Collections

```kotlin
val positives = list.filter { it > 0 }

// or with explicit type
val positives = list.filter { x -> x > 0 }
```

## Checking Element Presence

```kotlin
if ("john@example.com" in emailsList) { }
if ("jane@example.com" !in emailsList) { }
```

## String Interpolation

```kotlin
println("Name: $name")
println("Age: ${person.age}")
```

## Instance Checks

```kotlin
when (x) {
    is Foo -> ...
    is Bar -> ...
    else -> ...
}
```

## Read-only Collections

```kotlin
val list = listOf("a", "b", "c")
val map = mapOf("a" to 1, "b" to 2, "c" to 3)
```

## Accessing Maps

```kotlin
val map = mapOf("a" to 1)
println(map["a"]) // prints 1
```

## Traversing Maps

```kotlin
for ((k, v) in map) {
    println("$k -> $v")
}
```

## Ranges

```kotlin
for (i in 1..100) { }      // closed range: 1 to 100
for (i in 1..<100) { }     // half-open: 1 to 99
for (i in 2..10 step 2) { }
for (i in 10 downTo 1) { }
```

## Lazy Property

```kotlin
val p: String by lazy {
    // compute the string
}
```

## Extension Functions

```kotlin
fun String.spaceToCamelCase() { }
"Convert this to camelcase".spaceToCamelCase()
```

## Singleton

```kotlin
object Resource {
    val name = "Name"
}
```

## Instantiate Abstract Class

```kotlin
abstract class MyAbstractClass {
    abstract fun doSomething()
}

val myObject = object : MyAbstractClass() {
    override fun doSomething() { }
}
```

## if-not-null Shorthand

```kotlin
// Simple
val length = files?.size

// With else
val length = files?.size ?: 0

// With let
files?.let {
    println(it.size)
}
```

## Return on when

```kotlin
fun transform(color: String): Int {
    return when (color) {
        "Red" -> 0
        "Green" -> 1
        "Blue" -> 2
        else -> throw IllegalArgumentException("Invalid color")
    }
}
```

## try-catch Expression

```kotlin
val result = try {
    count()
} catch (e: ArithmeticException) {
    throw IllegalStateException(e)
}
```

## if Expression

```kotlin
val y = if (x == 1) {
    "one"
} else if (x == 2) {
    "two"
} else {
    "other"
}
```

## Builder-style Usage

```kotlin
fun arrayOfMinusOnes(size: Int): IntArray {
    return IntArray(size).apply { fill(-1) }
}
```

## Single-expression Functions

```kotlin
fun theAnswer() = 42

// equivalent to
fun theAnswer(): Int {
    return 42
}
```

## Call Multiple Methods (with)

```kotlin
class Turtle {
    fun penDown()
    fun penUp()
    fun turn(degrees: Double)
    fun forward(pixels: Double)
}

val myTurtle = Turtle()
with(myTurtle) {
    penDown()
    for (i in 1..4) {
        forward(100.0)
        turn(90.0)
    }
    penUp()
}
```

## Configure Object (apply)

```kotlin
val myRectangle = Rectangle().apply {
    length = 4
    breadth = 5
    color = 0xFAFAFA
}
```

## Swap Variables

```kotlin
var a = 1
var b = 2
a = b.also { b = a }
```

## TODO: Marking Incomplete

```kotlin
fun calcTaxes(): BigDecimal = TODO("Waiting for feedback from accounting")
```
