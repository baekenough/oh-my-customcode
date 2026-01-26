# Effective Go Reference

> Source: https://go.dev/doc/effective_go

## Introduction

Go is a new language. Although it borrows ideas from existing languages, it has unusual properties that make effective Go programs different in character from programs written in its relatives. A straightforward translation of a C++ or Java program into Go is unlikely to produce a satisfactory result—Java programs are written in Java, not Go.

## Formatting

Use `gofmt` (or `goimports`) to format all Go code. This eliminates formatting debates and ensures consistency.

Key points:
- Indentation: tabs, not spaces
- No line length limit (but break long lines sensibly)
- Fewer parentheses than C/Java

## Commentary

Go provides C-style `/* */` block comments and C++-style `//` line comments.

- Package comments: precede package clause, block comment for multi-line
- Doc comments: precede declarations, complete sentences starting with name
- `godoc` extracts documentation from comments

Example:
```go
// Package regexp implements a simple library for regular expressions.
package regexp

// Compile parses a regular expression and returns, if successful,
// a Regexp that can be used to match against text.
func Compile(str string) (*Regexp, error) {
```

## Names

### Package Names

- Short, concise, lowercase, single-word names
- No underscores or mixedCaps
- Name is the base name of its source directory
- Don't stutter: `bufio.Reader`, not `bufio.BufReader`

### Getters

- Don't use "Get" prefix
- `owner := obj.Owner()` not `obj.GetOwner()`
- Setters can use "Set": `obj.SetOwner(user)`

### Interface Names

- One-method interfaces: method name + "-er" suffix
- `Reader`, `Writer`, `Formatter`, `Notifier`

### MixedCaps

- Use `MixedCaps` or `mixedCaps` rather than underscores
- Exported: `MixedCaps` (capital first letter)
- Unexported: `mixedCaps` (lowercase first letter)

## Control Structures

### If

```go
// With initialization statement
if err := file.Chmod(0664); err != nil {
    log.Print(err)
    return err
}

// Avoid unnecessary else
if err != nil {
    return err
}
// continue normal flow
```

### For

```go
// Like C's for
for init; condition; post { }

// Like C's while
for condition { }

// Like C's for(;;)
for { }

// Range over slice
for key, value := range oldMap {
    newMap[key] = value
}

// Range over string (runes)
for pos, char := range "日本語" {
    fmt.Printf("character %c starts at byte position %d\n", char, pos)
}
```

### Switch

```go
// No automatic fallthrough
switch c {
case ' ', '?', '&', '=', '#', '+', '%':
    return true
}

// Type switch
switch t := t.(type) {
case bool:
    fmt.Printf("boolean %t\n", t)
case int:
    fmt.Printf("integer %d\n", t)
}
```

## Functions

### Multiple Return Values

```go
func (file *File) Write(b []byte) (n int, err error)
```

### Named Result Parameters

```go
func ReadFull(r Reader, buf []byte) (n int, err error) {
    for len(buf) > 0 && err == nil {
        var nr int
        nr, err = r.Read(buf)
        n += nr
        buf = buf[nr:]
    }
    return
}
```

### Defer

```go
func Contents(filename string) (string, error) {
    f, err := os.Open(filename)
    if err != nil {
        return "", err
    }
    defer f.Close()  // f.Close will run when we're finished.
    // ...
}
```

## Data

### Allocation with new

`new(T)` allocates zeroed storage for a new item of type `T` and returns its address, a value of type `*T`.

```go
p := new(SyncedBuffer)  // type *SyncedBuffer
var v SyncedBuffer      // type SyncedBuffer
```

### Allocation with make

`make(T, args)` creates slices, maps, and channels only. It returns an initialized (not zeroed) value of type `T` (not `*T`).

```go
make([]int, 10, 100)      // slice with len=10, cap=100
make(map[string]int)      // map
make(chan int, 100)       // buffered channel
```

### Arrays and Slices

```go
// Array - fixed size, value type
var a [10]int

// Slice - dynamic size, reference to array
s := make([]int, 10)
s = append(s, 1, 2, 3)
```

### Maps

```go
m := make(map[string]int)
m["key"] = 42

// Comma ok idiom
if val, ok := m["key"]; ok {
    // key exists
}

delete(m, "key")
```

## Methods

### Pointer vs Value Receivers

```go
// Value receiver - operates on copy
func (s MyStruct) ValueMethod() { }

// Pointer receiver - can modify, avoids copy
func (s *MyStruct) PointerMethod() { }
```

Rule: If any method needs a pointer receiver, all methods on that type should have pointer receivers.

## Interfaces

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// Composition
type ReadWriter interface {
    Reader
    Writer
}
```

## Embedding

```go
type ReadWriter struct {
    *Reader  // embedded
    *Writer  // embedded
}
```

## Concurrency

### Goroutines

```go
go list.Sort()  // run list.Sort concurrently
```

### Channels

```go
ci := make(chan int)            // unbuffered channel of integers
cj := make(chan int, 0)         // unbuffered channel of integers
cs := make(chan *os.File, 100)  // buffered channel of pointers to Files

c <- 1    // send
v := <-c  // receive
```

### Select

```go
select {
case v := <-ch1:
    fmt.Println("received from ch1:", v)
case ch2 <- 42:
    fmt.Println("sent to ch2")
default:
    fmt.Println("no communication")
}
```

## Errors

```go
type error interface {
    Error() string
}

// Creating errors
errors.New("message")
fmt.Errorf("operation failed: %w", err)

// Checking errors
if err != nil {
    return err
}
```

## Panic and Recover

```go
func server(workChan <-chan *Work) {
    for work := range workChan {
        go safelyDo(work)
    }
}

func safelyDo(work *Work) {
    defer func() {
        if err := recover(); err != nil {
            log.Println("work failed:", err)
        }
    }()
    do(work)
}
```
