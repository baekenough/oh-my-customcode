---
name: go-best-practices
description: Idiomatic Go patterns from Effective Go
scope: core
user-invocable: false
---

## Purpose

Apply idiomatic Go patterns and best practices from official Go documentation.

**Version baseline (as of 2026-11)**: Go 1.26 and 1.27 are the supported releases; the latest release is 1.27.3 (2026-10-19). Policy: "Each major Go release is supported until there are two newer major releases." Source: https://go.dev/doc/devel/release. Re-measure before relying on these numbers. Feature headings below carry the Go version that introduced the feature; check the `go` directive in `go.mod` before using one.

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

### 11. Generics (Go 1.18+)

```yaml
when_to_use:
  - One algorithm over several element types (containers, slice/map helpers)
  - Use a plain interface when only behavior matters, not the concrete type
  - Add type parameters when you are about to write the exact same code for several types; do not start by designing constraints (go.dev/blog/when-generics)

constraints:
  - any: no requirements; comparable: supports == and map keys
  - cmp.Ordered (1.21): supports < and >; prefer standard constraints before writing your own
  - Custom constraint: an interface with a type set, ~ includes defined types (~int | ~float64)

inference:
  - Let the compiler infer type arguments: Sum(xs), not Sum[int](xs)
  - Spell out type arguments only when inference fails
```

```go
type Number interface {
	~int | ~int64 | ~float64
}

func Sum[T Number](s []T) T {
	var total T
	for _, v := range s {
		total += v
	}
	return total
}
```

### 12. Iterators: range-over-func and iter (Go 1.23+)

```yaml
range_over_func:
  - for v := range seq works when seq is func(yield func(V) bool)
  - iter.Seq[V] and iter.Seq2[K, V] name the one- and two-value iterator types
  - The iterator must stop when yield returns false (the loop body broke out)
  - Calling yield again after it returned false panics at run time

conventions:
  - Return iter.Seq / iter.Seq2 from methods named All, Values, Keys
  - Prefer push iterators (range-over-func); use iter.Pull when a range loop is not the natural way to consume a sequence (e.g. stepping two sequences in lockstep)
  - iter.Pull returns next and stop: always defer stop()
  - Collect to a slice with slices.Collect when a caller needs random access
```

```go
func Countdown(n int) iter.Seq[int] {
	return func(yield func(int) bool) {
		for i := n; i > 0; i-- {
			if !yield(i) {
				return
			}
		}
	}
}

// for v := range Countdown(3) { fmt.Println(v) }  // 3 2 1
```

### 13. Packages slices and maps (Go 1.21+)

These are standard-library packages; they are separate from the built-in slice and map types in section 5.

```yaml
slices:
  - Search: slices.Contains, slices.Index, slices.BinarySearch (sorted input)
  - Order: slices.Sort, slices.SortFunc with cmp.Compare; prefer over sort.Slice in new code
  - Edit: slices.Insert, slices.Delete, slices.Compact; assign the result back (s = slices.Delete(s, i, j))
  - Copy and compare: slices.Clone, slices.Equal
  - Iterators (1.23): slices.All, slices.Values, slices.Collect, slices.Sorted

maps:
  - maps.Keys and maps.Values return iterators (iter.Seq), not slices (1.23)
  - Sorted keys: slices.Sorted(maps.Keys(m)); map iteration order is random
  - Other helpers: maps.Clone, maps.Copy, maps.Equal, maps.DeleteFunc, maps.Collect (1.23)
```

```go
m := map[string]int{"b": 2, "a": 1, "c": 3}
keys := slices.Sorted(maps.Keys(m))        // [a b c]
_, found := slices.BinarySearch(keys, "b") // found == true
```

### 14. Testing and go vet

```yaml
table_driven:
  - Cases are a slice of structs with a name field; run each with t.Run(tc.name, ...)
  - Failure message form: t.Errorf("F(%v) = %v, want %v", in, got, want)
  - Compare errors with errors.Is / errors.As, not by message text
  - t.Parallel() inside t.Run is safe without a loop-variable copy when go.mod says go 1.22 or newer
  - Helpers call t.Helper(); temporary files use t.TempDir()

go_vet:
  - Run go vet ./... locally and in CI; run go test -race ./... for concurrent code
  - Go 1.25 adds the waitgroup analyzer: it reports sync.WaitGroup.Add called inside the goroutine it is meant to wait for (it catches the simple form: wg.Add as the first statement of a go func literal)
  - Go 1.25 also adds sync.WaitGroup.Go, which pairs Add and Done for you
```

```go
func TestSum(t *testing.T) {
	tests := []struct {
		name string
		in   []int
		want int
	}{
		{"empty", nil, 0},
		{"single", []int{5}, 5},
		{"several", []int{1, 2, 3}, 6},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := Sum(tc.in); got != tc.want {
				t.Errorf("Sum(%v) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}
```

```go
var wg sync.WaitGroup
for range n {
	wg.Go(work) // Go 1.25+: wg.Go does Add(1), runs work in a new goroutine, then Done; call Go before Wait
}
wg.Wait()
```

## Application

When writing or reviewing Go code:

1. **Always** run `gofmt` or `goimports`
2. **Always** handle returned errors, and run `go vet ./...`
3. **Prefer** composition over inheritance
4. **Prefer** small interfaces
5. **Prefer** channels for goroutine communication
6. **Avoid** global state
7. **Avoid** init() when possible
8. **Document** exported identifiers
