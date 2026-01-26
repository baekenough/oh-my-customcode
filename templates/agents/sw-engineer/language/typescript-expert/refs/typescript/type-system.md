# TypeScript Type System

> Reference for TypeScript type fundamentals

## Basic Types

```typescript
// Primitives
const name: string = 'TypeScript';
const version: number = 5.0;
const isActive: boolean = true;

// Arrays
const numbers: number[] = [1, 2, 3];
const items: Array<string> = ['a', 'b', 'c'];

// Tuples
const pair: [string, number] = ['key', 42];

// Enums
enum Status {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
}

// Any and Unknown
const flexible: any = 'anything';
const safe: unknown = 'must narrow';

// Void and Never
function log(message: string): void {
  console.log(message);
}

function fail(message: string): never {
  throw new Error(message);
}
```

## Interfaces

```typescript
interface User {
  readonly id: string;
  name: string;
  email: string;
  age?: number; // optional
}

// Extending interfaces
interface Admin extends User {
  permissions: string[];
}

// Implementing interfaces
class UserImpl implements User {
  readonly id: string;
  name: string;
  email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }
}
```

## Type Aliases

```typescript
// Union types
type Status = 'pending' | 'active' | 'completed';

// Intersection types
type Employee = User & { department: string };

// Function types
type Handler = (event: Event) => void;

// Object types
type Point = {
  x: number;
  y: number;
};
```

## Generics

```typescript
// Generic function
function identity<T>(arg: T): T {
  return arg;
}

// Generic interface
interface Container<T> {
  value: T;
  getValue(): T;
}

// Generic class
class Box<T> {
  private content: T;

  constructor(content: T) {
    this.content = content;
  }

  getContent(): T {
    return this.content;
  }
}

// Generic constraints
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

// Default type parameters
function createArray<T = string>(length: number, value: T): T[] {
  return Array(length).fill(value);
}
```

## Type Guards

```typescript
// typeof guard
function processValue(value: string | number) {
  if (typeof value === 'string') {
    console.log(value.toUpperCase());
  } else {
    console.log(value.toFixed(2));
  }
}

// instanceof guard
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.log(error.message);
  }
}

// Custom type guard
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj
  );
}

// in operator
function processShape(shape: Circle | Square) {
  if ('radius' in shape) {
    console.log('Circle with radius:', shape.radius);
  } else {
    console.log('Square with side:', shape.side);
  }
}
```

## Literal Types

```typescript
// String literals
type Direction = 'north' | 'south' | 'east' | 'west';

// Numeric literals
type DiceRoll = 1 | 2 | 3 | 4 | 5 | 6;

// Boolean literal
type Success = true;

// Template literal types
type EventName = `on${Capitalize<string>}`;
type OnClick = `on${'Click' | 'Hover'}`;
```

## Type Assertions

```typescript
// as syntax (preferred)
const input = document.getElementById('input') as HTMLInputElement;

// Angle bracket syntax
const input2 = <HTMLInputElement>document.getElementById('input');

// Non-null assertion
const element = document.getElementById('root')!;

// const assertion
const config = {
  endpoint: '/api',
  timeout: 5000,
} as const;
```

## Nullability

```typescript
// Optional property
interface User {
  name: string;
  email?: string;
}

// Optional chaining
const email = user?.email?.toLowerCase();

// Nullish coalescing
const displayName = user.nickname ?? user.name;

// Non-null assertion
const element = document.getElementById('root')!;
```
