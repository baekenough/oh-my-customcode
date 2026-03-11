# Flutter Fundamentals

> Reference: Flutter Official Documentation (docs.flutter.dev)

## Widget System

Flutter's UI is built with a composition of widgets. Everything is a widget — including padding, alignment, and decoration.

### Widget Types

| Type | Use Case | State |
|------|----------|-------|
| `StatelessWidget` | Pure rendering, no mutable state | Immutable |
| `StatefulWidget` | Local ephemeral state (animations, forms) | Mutable via `State<T>` |
| `InheritedWidget` | Data propagation down widget tree | Foundation of Provider |

### Widget Lifecycle

```dart
// StatefulWidget lifecycle
class MyWidget extends StatefulWidget {
  @override
  State<MyWidget> createState() => _MyWidgetState();
}

class _MyWidgetState extends State<MyWidget> {
  @override
  void initState() { super.initState(); /* one-time setup */ }

  @override
  void didChangeDependencies() { super.didChangeDependencies(); /* InheritedWidget changed */ }

  @override
  void didUpdateWidget(MyWidget oldWidget) { super.didUpdateWidget(oldWidget); /* parent rebuilt */ }

  @override
  Widget build(BuildContext context) { return Container(); /* called on every rebuild */ }

  @override
  void dispose() { /* cleanup controllers, subscriptions */ super.dispose(); }
}
```

## Three-Tree Architecture

Flutter maintains three parallel trees:

```
Widget Tree (immutable descriptions)
    ↓ createElement()
Element Tree (persistent, mutable handles)
    ↓ createRenderObject()
RenderObject Tree (layout + paint primitives)
```

- **Widget**: Lightweight, immutable configuration. Rebuilt frequently.
- **Element**: Persistent handle that manages widget lifecycle. Enables efficient diffing.
- **RenderObject**: Expensive layout/paint primitives. Only updated when properties change.

### Layout Algorithm

**Constraints go down, sizes go up, parent decides position.**

```dart
// Parent passes BoxConstraints to child
// Child returns its chosen Size within those constraints
// Parent positions child at an Offset
```

Common layout errors:
- Unbounded height/width in `Column`/`Row` → wrap with `Expanded` or `Flexible`
- `Viewport was given unbounded height` → provide explicit height or use `SliverList`

## BuildContext

`BuildContext` is a handle to the widget's location in the Element tree.

```dart
// Access inherited data
final theme = Theme.of(context);
final mediaQuery = MediaQuery.of(context);

// NEVER store context across async gaps
// ALWAYS check mounted before using context after await
if (!mounted) return;
Navigator.of(context).push(...);
```

## Keys

| Key Type | When to Use |
|----------|-------------|
| `ValueKey` | Items with unique business identity (user ID, product SKU) |
| `ObjectKey` | Items without natural key (use the object itself) |
| `UniqueKey` | Force new Element every build (rare, expensive) |
| `GlobalKey` | Cross-widget state access (use sparingly — breaks encapsulation) |

```dart
// Reorderable list MUST use keys
ListView(
  children: items.map((item) => ListTile(
    key: ValueKey(item.id),
    title: Text(item.name),
  )).toList(),
);
```

## Package Recommendations

| Category | Package | Notes |
|----------|---------|-------|
| State (default) | `flutter_riverpod` | Compile-time safe, built-in DI |
| State (enterprise) | `flutter_bloc` | Event-driven, audit trails |
| Navigation | `go_router` | Official, deep linking, web |
| Models | `freezed` + `json_serializable` | Immutable, code-gen |
| HTTP | `dio` | Interceptors, cancellation |
| Linting | `very_good_analysis` | Community standard rules |
| Testing | `mocktail` | Null-safe mocking, no codegen |
| Secure Storage | `flutter_secure_storage` | Keychain/Keystore |
