# Rust Error Handling

> Reference for error handling patterns in Rust

## Result Type

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

### Basic Usage

```rust
use std::fs::File;

fn main() {
    let f = File::open("hello.txt");

    let f = match f {
        Ok(file) => file,
        Err(error) => panic!("Problem opening file: {:?}", error),
    };
}
```

### Matching Different Errors

```rust
use std::fs::File;
use std::io::ErrorKind;

fn main() {
    let f = File::open("hello.txt");

    let f = match f {
        Ok(file) => file,
        Err(error) => match error.kind() {
            ErrorKind::NotFound => match File::create("hello.txt") {
                Ok(fc) => fc,
                Err(e) => panic!("Problem creating file: {:?}", e),
            },
            other_error => panic!("Problem opening file: {:?}", other_error),
        },
    };
}
```

### Shortcuts

```rust
// unwrap: panics on error
let f = File::open("hello.txt").unwrap();

// expect: panics with custom message
let f = File::open("hello.txt").expect("Failed to open hello.txt");

// unwrap_or: provides default value
let f = File::open("hello.txt").unwrap_or(default_file);

// unwrap_or_else: computes default on error
let f = File::open("hello.txt").unwrap_or_else(|error| {
    panic!("Problem opening file: {:?}", error)
});
```

## Propagating Errors

### With match

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_username() -> Result<String, io::Error> {
    let f = File::open("hello.txt");

    let mut f = match f {
        Ok(file) => file,
        Err(e) => return Err(e),
    };

    let mut s = String::new();

    match f.read_to_string(&mut s) {
        Ok(_) => Ok(s),
        Err(e) => Err(e),
    }
}
```

### With ? Operator

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_username() -> Result<String, io::Error> {
    let mut f = File::open("hello.txt")?;
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    Ok(s)
}

// Chained version
fn read_username_chained() -> Result<String, io::Error> {
    let mut s = String::new();
    File::open("hello.txt")?.read_to_string(&mut s)?;
    Ok(s)
}
```

## Custom Error Types

### Simple Custom Error

```rust
use std::fmt;

#[derive(Debug)]
struct MyError {
    message: String,
}

impl fmt::Display for MyError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for MyError {}
```

### Error Enum

```rust
use std::io;
use std::num::ParseIntError;

#[derive(Debug)]
enum AppError {
    Io(io::Error),
    Parse(ParseIntError),
    Custom(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::Io(e) => write!(f, "IO error: {}", e),
            AppError::Parse(e) => write!(f, "Parse error: {}", e),
            AppError::Custom(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<io::Error> for AppError {
    fn from(error: io::Error) -> Self {
        AppError::Io(error)
    }
}

impl From<ParseIntError> for AppError {
    fn from(error: ParseIntError) -> Self {
        AppError::Parse(error)
    }
}
```

## Option Type

```rust
enum Option<T> {
    Some(T),
    None,
}
```

### Usage

```rust
fn divide(a: f64, b: f64) -> Option<f64> {
    if b == 0.0 {
        None
    } else {
        Some(a / b)
    }
}

// Pattern matching
match divide(10.0, 2.0) {
    Some(result) => println!("Result: {}", result),
    None => println!("Cannot divide by zero"),
}

// Combinators
let result = divide(10.0, 2.0)
    .map(|x| x * 2.0)
    .unwrap_or(0.0);
```

## Panic

### When to Panic

```rust
// Unrecoverable errors
panic!("crash and burn");

// Assertion failures
assert!(x > 0, "x must be positive");
assert_eq!(a, b, "values must be equal");

// Unreachable code
unreachable!("this should never happen");
```

### Panic vs Result

- Use `Result` for recoverable errors
- Use `panic!` for unrecoverable errors
- Library code should return `Result`
- `main` can panic or return `Result`

## Best Practices

```rust
// 1. Use ? for propagation
fn process() -> Result<Data, Error> {
    let input = read_input()?;
    let parsed = parse(input)?;
    Ok(transform(parsed))
}

// 2. Add context with map_err
let file = File::open(&path)
    .map_err(|e| format!("Failed to open {}: {}", path, e))?;

// 3. Use anyhow for applications
use anyhow::{Context, Result};

fn main() -> Result<()> {
    let config = read_config()
        .context("Failed to read configuration")?;
    Ok(())
}

// 4. Use thiserror for libraries
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DataError {
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("IO error")]
    Io(#[from] std::io::Error),
}
```
