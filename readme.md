# RxJS Operators: throttleMap and publishWhile

This package provides two custom RxJS operators:
- `throttleMap`
- `publishWhile`

## throttleMap

```typescript
const id$ = new ReplaySubject<number>(1);
const response$ = id$.pipe(
    throttleMap(id => doRequest(id))
);
```

`throttleMap` is a higher-order operator similar to `switchMap`. While it produces the same output as `switchMap`, it differs in that it doesn't cancel internal requests. Instead, it waits for the previous observable to complete before starting a new one (if a new event appears in the source).

**Purpose**: Prevent DDoS scenarios in multi-layered backend architectures with microservices that cannot handle cancelled requests properly.

### Example

```typescript
const doRequest = (id: number) => {
    console.log(`Request for id ${id} started`);
    return of(`Response with id ${id}`).pipe(
        delay(10000) // Simulate heavy request
    );
}

const id$ = new ReplaySubject<number>(1);
const response$ = id$.pipe(
    throttleMap(id => doRequest(id))
);

for (let id = 1; id <= 5; id++) {
    id$.next(id);
}

response$.subscribe(console.log);
```

**Output**:
```
Request for id 1 started
Request for id 5 started
Response with id 5
```

With `switchMap`, the output would be:
```
Request for id 1 started
Request for id 2 started
Request for id 3 started
Request for id 4 started
Request for id 5 started
Response with id 5
```

### Usage Guidelines
- Use `switchMap` when the backend can handle cancelled requests properly
- Use `throttleMap` when the backend cannot handle cancellations effectively. This operator reduces backend load in scenarios with UI filters and heavy entity list responses.

## publishWhile

An operator for state management and cache invalidation.

```typescript
const active$ = new BehaviorSubject(true);
const id$ = new ReplaySubject<number>(1);
const response$ = id$.pipe(
    throttleMap(id => doRequest(id)),
    publishWhile(active$)
);
```

While `active$` emits `true`, `publishWhile` behaves like `shareReplay(1)`.

When `active$` emits a new `true` value, `publishWhile` re-creates the internal subscription, causing `doRequest` to execute again. This is useful for refreshing cached values in observables.

When `active$` becomes `false`, `publishWhile` unsubscribes from the internal observable. External subscribers can still subscribe to `response$`, but the observable remains cold until `active$` emits `true` again.

**Use Case**: Temporarily disable subscriptions when underlying requests cannot be executed (e.g., user logged out, authentication token expired waiting for renewal).

### Additional Options

```typescript
const response$ = id$.pipe(
    throttleMap(id => doRequest(id)),
    publishWhile(active$, { 
        bufferSize: 1,    // Default: 1
        refCount: true    // Default: false
    })
);
```

These options mirror the behavior of `shareReplay`.