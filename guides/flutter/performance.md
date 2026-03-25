# Flutter Performance

> Reference: docs.flutter.dev/perf/best-practices

## Frame Budget

- Target: **<8ms build + <8ms render = 16.67ms** (60fps)
- Profile with: `flutter run --profile` (not debug mode)
- Tool: DevTools Performance view → identify jank frames

## Build-Time Optimization

### const Constructors

```dart
// GOOD — zero rebuild cost
const Text('Hello');
const SizedBox(height: 8);
const Icon(Icons.star);

// BAD — new instance every build
Text('Hello');
SizedBox(height: 8);
```

### Localize setState

```dart
// BAD — rebuilds entire screen
class _ScreenState extends State<Screen> {
  int count = 0;
  Widget build(BuildContext context) {
    return Column(children: [
      ExpensiveHeader(), // rebuilt unnecessarily
      Text('$count'),
      ElevatedButton(onPressed: () => setState(() => count++), child: Text('+'))
    ]);
  }
}

// GOOD — only counter rebuilds
class _ScreenState extends State<Screen> {
  Widget build(BuildContext context) {
    return Column(children: [
      const ExpensiveHeader(), // not rebuilt
      CounterWidget(), // isolated StatefulWidget
    ]);
  }
}
```

### Extract Widgets (not methods)

```dart
// BAD — no Element identity, always rebuilds
Widget _buildHeader() => Container(...);

// GOOD — has Element identity, diffed efficiently
class HeaderWidget extends StatelessWidget {
  const HeaderWidget({super.key});
  @override
  Widget build(BuildContext context) => Container(...);
}
```

## Rendering Optimization

### RepaintBoundary

```dart
// Wrap frequently repainting subtrees
RepaintBoundary(
  child: AnimatedWidget(...), // only this subtree repaints
)
```

Detect with: DevTools → Rendering → "Highlight repaints"

### Avoid Expensive Widgets

| Avoid | Use Instead | Reason |
|-------|-------------|--------|
| `Opacity` widget | `color.withValues(alpha: 0.5)` | Opacity widget triggers saveLayer |
| `ClipRRect` in animations | Pre-clip static content | saveLayer per frame |
| `Container` for sizing | `SizedBox` | Lighter, no decoration |

## List Performance

```dart
// GOOD — lazy construction, O(visible) not O(total)
ListView.builder(
  itemCount: items.length,
  itemExtent: 72.0, // skip intrinsic layout passes
  itemBuilder: (context, index) => ProductTile(items[index]),
);

// BAD — builds ALL children upfront
ListView(children: items.map((i) => ProductTile(i)).toList());
```

## Compute Offloading

```dart
// CPU-intensive work (>16ms) on isolate
final result = await Isolate.run(() {
  return heavyJsonParsing(rawData);
});

// Web-compatible alternative
final result = await compute(heavyJsonParsing, rawData);
```

## DevTools Workflow

1. **Inspector** → identify widget causing rebuild
2. **Performance view** → identify jank frames (>16ms)
3. **CPU Profiler** → identify expensive Dart methods
4. **Memory view** → detect object leaks
5. **Network** → monitor API call timing
