# TypeScript Advanced Types

> Reference for advanced TypeScript type patterns

## Utility Types

```typescript
// Partial - make all properties optional
type PartialUser = Partial<User>;

// Required - make all properties required
type RequiredUser = Required<User>;

// Readonly - make all properties readonly
type ReadonlyUser = Readonly<User>;

// Pick - select specific properties
type UserName = Pick<User, 'name' | 'email'>;

// Omit - exclude specific properties
type UserWithoutId = Omit<User, 'id'>;

// Record - create object type with key-value pairs
type UserMap = Record<string, User>;

// Exclude - exclude types from union
type NonNullStatus = Exclude<Status | null, null>;

// Extract - extract types from union
type StringStatus = Extract<Status, string>;

// NonNullable - remove null and undefined
type DefinedValue = NonNullable<string | null | undefined>;

// ReturnType - get function return type
type Result = ReturnType<typeof fetchUser>;

// Parameters - get function parameter types
type Params = Parameters<typeof fetchUser>;
```

## Mapped Types

```typescript
// Make all properties optional
type Optional<T> = {
  [P in keyof T]?: T[P];
};

// Make all properties readonly
type Immutable<T> = {
  readonly [P in keyof T]: T[P];
};

// Make all properties nullable
type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

// Remap keys
type Getters<T> = {
  [P in keyof T as `get${Capitalize<string & P>}`]: () => T[P];
};

// Filter properties by type
type OnlyStrings<T> = {
  [P in keyof T as T[P] extends string ? P : never]: T[P];
};
```

## Conditional Types

```typescript
// Basic conditional
type IsString<T> = T extends string ? true : false;

// With infer
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// Array element type
type ElementType<T> = T extends (infer E)[] ? E : never;

// Function return type
type GetReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Distributive conditional
type ToArray<T> = T extends any ? T[] : never;
// ToArray<string | number> = string[] | number[]
```

## Template Literal Types

```typescript
// Simple template
type Greeting = `Hello, ${string}!`;

// With union
type EventHandler = `on${Capitalize<'click' | 'hover' | 'focus'>}`;
// 'onClick' | 'onHover' | 'onFocus'

// Extract from string
type ExtractRouteParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractRouteParams<Rest>
    : T extends `${string}:${infer Param}`
    ? Param
    : never;

// ExtractRouteParams<'/users/:id/posts/:postId'>
// = 'id' | 'postId'
```

## Discriminated Unions

```typescript
interface Circle {
  kind: 'circle';
  radius: number;
}

interface Square {
  kind: 'square';
  side: number;
}

interface Rectangle {
  kind: 'rectangle';
  width: number;
  height: number;
}

type Shape = Circle | Square | Rectangle;

function getArea(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    case 'rectangle':
      return shape.width * shape.height;
  }
}
```

## Index Signatures

```typescript
// String index
interface Dictionary {
  [key: string]: string;
}

// Number index
interface NumberMap {
  [index: number]: string;
}

// With specific properties
interface User {
  id: string;
  name: string;
  [key: string]: string; // additional properties
}

// Template literal index
type Handlers = {
  [K in `on${Capitalize<string>}`]: (event: Event) => void;
};
```

## Type Narrowing

```typescript
// Control flow analysis
function process(value: string | number | null) {
  if (value === null) {
    return; // value is null
  }

  if (typeof value === 'string') {
    console.log(value.toUpperCase()); // value is string
  } else {
    console.log(value.toFixed(2)); // value is number
  }
}

// Assertion functions
function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error('Not a string');
  }
}

// Type predicates
function isNonNull<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

const filtered = items.filter(isNonNull);
```

## Brand Types

```typescript
// Create distinct types for same underlying type
type UserId = string & { readonly brand: unique symbol };
type PostId = string & { readonly brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}

function createPostId(id: string): PostId {
  return id as PostId;
}

function getUser(id: UserId): User { ... }

const userId = createUserId('123');
const postId = createPostId('456');

getUser(userId); // OK
getUser(postId); // Error: PostId not assignable to UserId
```
