# Go Concurrency Patterns

> Reference for concurrent programming in Go

## Core Philosophy

> Do not communicate by sharing memory; instead, share memory by communicating.

Go's approach to concurrency differs from traditional threading models. Channels provide a way to safely communicate between goroutines without explicit locks.

## Goroutines

A goroutine is a lightweight thread managed by the Go runtime.

```go
// Start a goroutine
go doSomething()

// With anonymous function
go func() {
    // concurrent work
}()
```

### Goroutine Lifecycle

- Created with `go` keyword
- Runs concurrently with calling goroutine
- Exits when function returns
- Main goroutine exit = program exit

## Channels

### Basic Operations

```go
// Create
ch := make(chan int)        // unbuffered
ch := make(chan int, 10)    // buffered, capacity 10

// Send
ch <- value

// Receive
value := <-ch
value, ok := <-ch  // ok is false if channel closed

// Close
close(ch)
```

### Unbuffered vs Buffered

| Type | Behavior |
|------|----------|
| Unbuffered | Sender blocks until receiver ready |
| Buffered | Sender blocks only when buffer full |

### Directional Channels

```go
func sender(ch chan<- int) {
    ch <- 42  // send-only
}

func receiver(ch <-chan int) {
    v := <-ch  // receive-only
}
```

## Common Patterns

### Worker Pool

```go
func worker(id int, jobs <-chan int, results chan<- int) {
    for j := range jobs {
        results <- j * 2
    }
}

func main() {
    jobs := make(chan int, 100)
    results := make(chan int, 100)

    // Start 3 workers
    for w := 1; w <= 3; w++ {
        go worker(w, jobs, results)
    }

    // Send jobs
    for j := 1; j <= 9; j++ {
        jobs <- j
    }
    close(jobs)

    // Collect results
    for a := 1; a <= 9; a++ {
        <-results
    }
}
```

### Fan-Out, Fan-In

```go
// Fan-out: multiple goroutines read from same channel
// Fan-in: single goroutine reads from multiple channels

func fanIn(ch1, ch2 <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for {
            select {
            case v := <-ch1:
                out <- v
            case v := <-ch2:
                out <- v
            }
        }
    }()
    return out
}
```

### Pipeline

```go
func gen(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

func sq(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            out <- n * n
        }
        close(out)
    }()
    return out
}

// Usage: for v := range sq(sq(gen(2, 3))) { ... }
```

### Context for Cancellation

```go
func operation(ctx context.Context) error {
    select {
    case <-time.After(time.Second):
        return nil  // completed
    case <-ctx.Done():
        return ctx.Err()  // cancelled
    }
}

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
    defer cancel()

    if err := operation(ctx); err != nil {
        log.Fatal(err)
    }
}
```

## Select Statement

```go
select {
case v := <-ch1:
    // received from ch1
case ch2 <- x:
    // sent to ch2
case <-time.After(time.Second):
    // timeout
default:
    // non-blocking
}
```

## Synchronization

### sync.WaitGroup

```go
var wg sync.WaitGroup

for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        // work
    }(i)
}

wg.Wait()  // blocks until all done
```

### sync.Mutex

```go
var (
    mu      sync.Mutex
    counter int
)

func increment() {
    mu.Lock()
    defer mu.Unlock()
    counter++
}
```

### sync.Once

```go
var once sync.Once

func initialize() {
    once.Do(func() {
        // runs exactly once
    })
}
```

## Avoiding Common Pitfalls

### Goroutine Leaks

```go
// BAD: goroutine never exits
go func() {
    for {
        // infinite loop with no exit
    }
}()

// GOOD: use context or done channel
go func(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        default:
            // work
        }
    }
}(ctx)
```

### Race Conditions

```go
// BAD: race condition
go func() { x++ }()
go func() { x++ }()

// GOOD: use channels or mutex
go func() { ch <- 1 }()
go func() { ch <- 1 }()
x += <-ch + <-ch
```

### Closing Channels

```go
// Only sender should close
// Closing already-closed channel panics
// Sending to closed channel panics

// Pattern: use sync.Once or single sender
```
