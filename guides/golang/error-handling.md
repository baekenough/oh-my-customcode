# Go Error Handling

> Reference for error handling patterns in Go

## Error Interface

```go
type error interface {
    Error() string
}
```

Errors are values. They can be stored, passed, and compared.

## Creating Errors

### Simple Errors

```go
import "errors"

err := errors.New("something went wrong")
```

### Formatted Errors

```go
import "fmt"

err := fmt.Errorf("failed to process %s: %v", filename, err)
```

### Custom Error Types

```go
type MyError struct {
    Code    int
    Message string
}

func (e *MyError) Error() string {
    return fmt.Sprintf("error %d: %s", e.Code, e.Message)
}
```

## Handling Errors

### Basic Pattern

```go
result, err := doSomething()
if err != nil {
    return err
}
// use result
```

### Adding Context

```go
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething failed: %w", err)
}
```

### Multiple Returns

```go
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}
```

## Error Wrapping (Go 1.13+)

### Wrapping Errors

```go
// Use %w verb to wrap
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}
```

### Unwrapping Errors

```go
// errors.Unwrap returns the wrapped error
inner := errors.Unwrap(err)

// errors.Is checks if any error in chain matches
if errors.Is(err, os.ErrNotExist) {
    // handle file not found
}

// errors.As finds first error matching type
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Println("failed path:", pathErr.Path)
}
```

## Sentinel Errors

```go
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrInvalid      = errors.New("invalid input")
)

func fetch(id string) (*Item, error) {
    item, ok := store[id]
    if !ok {
        return nil, ErrNotFound
    }
    return item, nil
}

// Usage
item, err := fetch("123")
if errors.Is(err, ErrNotFound) {
    // handle not found
}
```

## Error Handling Strategies

### Fail Fast

```go
func process() error {
    if err := step1(); err != nil {
        return err
    }
    if err := step2(); err != nil {
        return err
    }
    return step3()
}
```

### Deferred Cleanup

```go
func processFile(path string) (err error) {
    f, err := os.Open(path)
    if err != nil {
        return err
    }
    defer func() {
        if cerr := f.Close(); cerr != nil && err == nil {
            err = cerr
        }
    }()
    // process file
    return nil
}
```

### Error Aggregation

```go
type MultiError []error

func (m MultiError) Error() string {
    var msgs []string
    for _, err := range m {
        msgs = append(msgs, err.Error())
    }
    return strings.Join(msgs, "; ")
}

func validateAll(items []Item) error {
    var errs MultiError
    for _, item := range items {
        if err := validate(item); err != nil {
            errs = append(errs, err)
        }
    }
    if len(errs) > 0 {
        return errs
    }
    return nil
}
```

## Panic and Recover

### When to Panic

- Unrecoverable errors during initialization
- Programming errors (nil pointer, out of bounds)
- Violation of invariants

```go
func MustCompile(pattern string) *Regexp {
    re, err := Compile(pattern)
    if err != nil {
        panic(err)
    }
    return re
}
```

### Recovering from Panic

```go
func safeCall(fn func()) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic recovered: %v", r)
        }
    }()
    fn()
    return nil
}
```

### Package Boundary Rule

- Convert panics to errors at package boundaries
- Don't let panics escape your API

```go
func (s *Server) handleRequest(w http.ResponseWriter, r *http.Request) {
    defer func() {
        if err := recover(); err != nil {
            log.Printf("panic: %v\n%s", err, debug.Stack())
            http.Error(w, "Internal Server Error", 500)
        }
    }()
    // handle request
}
```

## Best Practices

1. **Handle errors immediately** after the call
2. **Add context** when propagating errors
3. **Use error wrapping** with `%w` for error chains
4. **Define sentinel errors** for known conditions
5. **Don't ignore errors** (at minimum, log them)
6. **Prefer errors over panics** in library code
7. **Document error returns** in function comments
8. **Test error paths** as thoroughly as success paths
