# PEP 8 - Style Guide for Python Code

> Source: https://peps.python.org/pep-0008/

## Introduction

This document gives coding conventions for the Python code comprising the standard library. The key insight is that code is read much more often than it is written. Prioritize readability.

## Code Layout

### Indentation

Use 4 spaces per indentation level.

```python
# Aligned with opening delimiter
foo = long_function_name(var_one, var_two,
                         var_three, var_four)

# Hanging indent with additional level
def long_function_name(
        var_one, var_two, var_three,
        var_four):
    print(var_one)
```

### Maximum Line Length

- Limit all lines to 79 characters
- Docstrings/comments: limit to 72 characters
- Teams may agree on longer lines (up to 99)

### Binary Operators

Break before binary operators:

```python
# Correct:
income = (gross_wages
          + taxable_interest
          + (dividends - qualified_dividends))
```

### Blank Lines

- Two blank lines around top-level definitions
- One blank line between method definitions
- Extra blank lines sparingly to separate logical sections

## Imports

```python
# Standard library
import os
import sys

# Third party
import numpy as np

# Local
from myproject import mymodule
```

Rules:
- One import per line
- Absolute imports preferred
- Avoid wildcard imports

## Whitespace

```python
# Correct:
spam(ham[1], {eggs: 2})
x = 1
y = 2
long_variable = 3

# Wrong:
spam( ham[ 1 ], { eggs: 2 } )
x             = 1
y             = 2
long_variable = 3
```

## Comments

### Block Comments

```python
# This is a block comment that
# spans multiple lines and describes
# the following code block.
```

### Inline Comments

```python
x = x + 1  # Increment x
```

### Docstrings

```python
def complex(real=0.0, imag=0.0):
    """Form a complex number.

    Keyword arguments:
    real -- the real part (default 0.0)
    imag -- the imaginary part (default 0.0)
    """
    pass
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Module | lowercase_underscore | `my_module` |
| Package | lowercase | `mypackage` |
| Class | CapWords | `MyClass` |
| Exception | CapWords + Error | `CustomError` |
| Function | lowercase_underscore | `my_function` |
| Variable | lowercase_underscore | `my_var` |
| Constant | UPPER_UNDERSCORE | `MAX_SIZE` |
| Method | lowercase_underscore | `my_method` |

### Special Naming

- `_single_leading`: weak "internal use" indicator
- `__double_leading`: name mangling in classes
- `__double_both__`: "magic" methods

## Programming Recommendations

### Comparisons

```python
# Correct:
if foo is not None:
if isinstance(obj, int):

# Wrong:
if foo != None:
if type(obj) is int:
```

### Sequences

```python
# Correct:
if not seq:
if seq:

# Wrong:
if len(seq) == 0:
if len(seq) > 0:
```

### Exception Handling

```python
# Correct:
try:
    value = collection[key]
except KeyError:
    return key_not_found(key)

# Wrong:
try:
    value = collection[key]
except:  # Bare except
    return key_not_found(key)
```

### Context Managers

```python
# Correct:
with open('file.txt') as f:
    contents = f.read()

# Wrong:
f = open('file.txt')
contents = f.read()
f.close()
```

### Return Statements

```python
# Correct:
def foo(x):
    if x >= 0:
        return math.sqrt(x)
    else:
        return None

# Wrong:
def foo(x):
    if x >= 0:
        return math.sqrt(x)
```
