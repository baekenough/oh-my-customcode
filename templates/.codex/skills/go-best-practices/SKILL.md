---
name: go-best-practices
description: Idiomatic Go patterns from Effective Go
user-invocable: false
---

## Purpose

Apply idiomatic Go patterns and best practices from official Go documentation.

## Rules

### 1. Formatting

```yaml
rules:
  - Use gofmt for all code formatting
  - Indentation uses tabs, not spaces
  - No line length limit, but break long lines sensibly
  - Let gofmt handle alignment
```

### 2. Naming Conventions

```yaml
package_names:
  - Short, concise, lowercase, single-word
  - No underscores or mixedCaps
  - Name is basename of source directory
  - Example: bufio, not bufIO or buf_io

getters:
  - No "Get" prefix for getters
  - obj.Owner() not obj.GetOwner()
  - Setter can use "Set": obj.SetOwner(user)

interface_names:
  - One-method interfaces: method name + "er"
  - Reader, Writer, Formatter, CloseNotifier
  - Avoid stealing standard names unless same signature

mixedCaps:
  - Use MixedCaps or mixedCaps, never underscores
  - Exported: MixedCaps (uppercase first)
  - Unexported: mixedCaps (lowercase first)
```

### 3. Control Structures

```yaml
if_statements:
  - Accept initialization statement
  - Prefer: if err := file.Chmod(0664); err != nil
  - Omit else when if ends with break/continue/return
  - Avoid unnecessary else

for_loops:
  - Go's only loop construct
  - for init; condition; post { } - like C for
  - for condition { } - like C while
  - for { } - infinite loop
  - Use range for strings, slices, arrays, maps, channels

switch:
  - Cases don't fall through by default
  - Use fallthrough keyword if needed
  - Multiple cases: case '0', '1', '2'
  - Type switch: switch v := x.(type)
```

### 4. Functions

```yaml
multiple_returns:
  - Return multiple values for result + error
  - func (file *File) Write(b []byte) (n int, err error)

named_results:
  - Document return values with names
  - Can simplify code but use judiciously
  - Unnamed returns OK for short functions

defer:
  - Executes when function returns
  - LIFO order for multiple defers
  - Use for cleanup: unlock mutexes, close files
  - Arguments evaluated when defer executes, not when called
```

### 5. Data

```yaml
new_vs_make:
  - new(T): allocates zeroed storage, returns *T
  - make(T, args): creates slices, maps, channels only
  - make returns initialized (not zeroed) value of type T

slices:
  - Backed by arrays, can grow
  - append() to add elements
  - copy() for safe duplication
  - Slice of slice shares underlying array

maps:
  - Reference type, nil until initialized
  - make(map[KeyType]ValueType)
  - Comma ok idiom: val, ok := map[key]
  - delete(map, key) to remove
```

### 6. Methods

```yaml
pointer_vs_value_receivers:
  - Pointer receiver: can modify, no copy overhead
  - Value receiver: safe from modification
  - If any method needs pointer, all should use pointer
  - Rule: values immutable, pointers mutable
```

### 7. Interfaces

```yaml
design:
  - Interfaces define behavior, not data
  - Small interfaces (1-3 methods) preferred
  - Accept interfaces, return structs
  - If type implements interface, it satisfies implicitly

common_interfaces:
  - io.Reader: Read(p []byte) (n int, err error)
  - io.Writer: Write(p []byte) (n int, err error)
  - fmt.Stringer: String() string
  - error: Error() string
```

### 8. Concurrency

```yaml
goroutines:
  - Lightweight, multiplexed onto OS threads
  - go function() to start
  - Don't communicate by sharing memory
  - Share memory by communicating

channels:
  - Primary synchronization mechanism
  - ch := make(chan int) - unbuffered
  - ch := make(chan int, 100) - buffered
  - Send: ch <- v
  - Receive: v := <-ch
  - Close: close(ch)

patterns:
  - Don't leak goroutines - ensure they exit
  - Use context for cancellation
  - select for multiple channel operations
  - sync.WaitGroup for goroutine coordination
```

### 9. Error Handling

```yaml
principles:
  - Errors are values, handle them explicitly
  - Check errors immediately after call
  - Return errors, don't panic
  - Add context when propagating: fmt.Errorf("op failed: %w", err)

panic_recover:
  - Panic for unrecoverable errors only
  - Library functions should return errors, not panic
  - Recover only in deferred functions
  - Convert internal panics to errors at package boundary
```

### 10. Project Structure

```yaml
packages:
  - One package per directory
  - Package name matches directory name
  - main package for executables
  - Avoid circular imports

files:
  - doc.go for package documentation
  - _test.go suffix for test files
  - Group related types and functions
```

## Application

When writing or reviewing Go code:

1. **Always** run `gofmt` or `goimports`
2. **Always** handle returned errors
3. **Prefer** composition over inheritance
4. **Prefer** small interfaces
5. **Prefer** channels for goroutine communication
6. **Avoid** global state
7. **Avoid** init() when possible
8. **Document** exported identifiers
