# Uber Go Style Guide

> Source: https://github.com/uber-go/guide/blob/master/style.md

## Guidelines

### Verify Interface Compliance

```go
// Compile-time check
var _ http.Handler = (*Handler)(nil)
var _ io.Reader = (*MyReader)(nil)
```

### Receiver Type

```go
// Value receiver: doesn't modify state
func (s Stack) Length() int {
    return len(s.items)
}

// Pointer receiver: modifies state or is large
func (s *Stack) Push(item int) {
    s.items = append(s.items, item)
}
```

### Zero-value Mutexes

```go
// Good: zero-value is valid
var mu sync.Mutex

// Good: embedded in struct
type Store struct {
    mu    sync.Mutex
    items map[string]Item
}
```

### Copy Slices and Maps

```go
// Returning: copy to prevent external modification
func (s *Store) GetItems() []Item {
    s.mu.RLock()
    defer s.mu.RUnlock()
    items := make([]Item, len(s.items))
    copy(items, s.items)
    return items
}

// Receiving: copy to prevent caller modification
func (s *Store) SetItems(items []Item) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.items = make([]Item, len(items))
    copy(s.items, items)
}
```

### Defer for Cleanup

```go
func readFile(path string) ([]byte, error) {
    f, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer f.Close()
    return io.ReadAll(f)
}

func process() {
    mu.Lock()
    defer mu.Unlock()
    // ...
}
```

### Channel Size

```go
// Good: unbuffered or 1
ch := make(chan int)
ch := make(chan int, 1)

// Requires justification
ch := make(chan int, 100) // Why 100?
```

### Start Enums at One

```go
type Operation int

const (
    Add Operation = iota + 1
    Subtract
    Multiply
)
```

### Error Types

```go
// Sentinel errors
var ErrNotFound = errors.New("not found")

// Error wrapping
if err != nil {
    return fmt.Errorf("failed to get user: %w", err)
}

// Checking errors
if errors.Is(err, ErrNotFound) {
    // handle not found
}
```

### Handle Errors Once

```go
// Bad: logs AND returns
if err != nil {
    log.Printf("error: %v", err)
    return err
}

// Good: return with context
if err != nil {
    return fmt.Errorf("process: %w", err)
}
```

### Use strconv Over fmt

```go
// Good
s := strconv.Itoa(n)
n, err := strconv.Atoi(s)

// Slower
s := fmt.Sprintf("%d", n)
```

### Table-Driven Tests

```go
func TestSplit(t *testing.T) {
    tests := []struct {
        name  string
        input string
        sep   string
        want  []string
    }{
        {
            name:  "simple",
            input: "a/b/c",
            sep:   "/",
            want:  []string{"a", "b", "c"},
        },
        {
            name:  "empty",
            input: "",
            sep:   "/",
            want:  []string{""},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := strings.Split(tt.input, tt.sep)
            if diff := cmp.Diff(tt.want, got); diff != "" {
                t.Errorf("mismatch (-want +got):\n%s", diff)
            }
        })
    }
}
```

### Functional Options

```go
type Server struct {
    addr    string
    timeout time.Duration
}

type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) {
        s.timeout = d
    }
}

func NewServer(addr string, opts ...Option) *Server {
    s := &Server{
        addr:    addr,
        timeout: time.Second * 30,
    }
    for _, opt := range opts {
        opt(s)
    }
    return s
}

// Usage
server := NewServer(":8080", WithTimeout(time.Minute))
```
