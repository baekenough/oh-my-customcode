# Rust Ownership

> Reference for ownership, borrowing, and lifetimes

## Ownership Rules

1. Each value has exactly one owner
2. When the owner goes out of scope, the value is dropped
3. Values can be moved or borrowed

## Move Semantics

```rust
// Move ownership
let s1 = String::from("hello");
let s2 = s1; // s1 is moved to s2
// s1 is no longer valid

// Clone to copy
let s1 = String::from("hello");
let s2 = s1.clone(); // s1 is still valid

// Copy types (stack-only data)
let x = 5;
let y = x; // x is still valid (i32 implements Copy)
```

## Borrowing

### Immutable References

```rust
fn main() {
    let s1 = String::from("hello");
    let len = calculate_length(&s1); // borrow s1
    println!("The length of '{}' is {}.", s1, len);
}

fn calculate_length(s: &String) -> usize {
    s.len()
}
```

### Mutable References

```rust
fn main() {
    let mut s = String::from("hello");
    change(&mut s);
}

fn change(some_string: &mut String) {
    some_string.push_str(", world");
}
```

### Borrowing Rules

```rust
// Rule 1: At any time, either ONE mutable reference
// OR any number of immutable references
let mut s = String::from("hello");

let r1 = &s; // OK
let r2 = &s; // OK
// let r3 = &mut s; // ERROR: cannot borrow as mutable

let r3 = &mut s; // OK after r1 and r2 are done
```

## Lifetimes

### Basic Syntax

```rust
// Lifetime annotation
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

### Struct Lifetimes

```rust
struct ImportantExcerpt<'a> {
    part: &'a str,
}

impl<'a> ImportantExcerpt<'a> {
    fn level(&self) -> i32 {
        3
    }

    fn announce_and_return_part(&self, announcement: &str) -> &str {
        println!("Attention please: {}", announcement);
        self.part
    }
}
```

### Lifetime Elision

```rust
// These are equivalent:
fn first_word(s: &str) -> &str { ... }
fn first_word<'a>(s: &'a str) -> &'a str { ... }

// Elision rules:
// 1. Each reference parameter gets its own lifetime
// 2. If exactly one input lifetime, it's assigned to all outputs
// 3. If &self or &mut self, its lifetime is assigned to outputs
```

### Static Lifetime

```rust
// 'static: lives for entire program duration
let s: &'static str = "I have a static lifetime.";

// All string literals have 'static lifetime
```

## Common Patterns

### Returning References

```rust
// Cannot return reference to local variable
fn dangle() -> &String { // ERROR
    let s = String::from("hello");
    &s // s goes out of scope!
}

// Return owned value instead
fn no_dangle() -> String {
    let s = String::from("hello");
    s
}
```

### Struct with References

```rust
// Struct holding reference must have lifetime
struct Config<'a> {
    query: &'a str,
    filename: &'a str,
}

// Implementation with lifetime
impl<'a> Config<'a> {
    fn new(args: &'a [String]) -> Config<'a> {
        Config {
            query: &args[1],
            filename: &args[2],
        }
    }
}
```

### Multiple Lifetimes

```rust
fn longest_with_announcement<'a, 'b>(
    x: &'a str,
    y: &'a str,
    ann: &'b str,
) -> &'a str {
    println!("Announcement: {}", ann);
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```
