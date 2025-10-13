import {
  BehaviorSubject,
  delay,
  firstValueFrom,
  merge,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { publishWhile } from './publishWhile';

describe('publishWhile', () => {
  beforeEach(() => {});
  it('shareReplay - validate test kit', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), shareReplay(1));

    const res = await firstValueFrom(stream$);
    const res2 = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });

    expect(res2).toEqual({ input: 1, count: 1 });
  });

  it('buffer last value without active subscriber and refCount:false', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(
      switchMap(doRequest),
      publishWhile(active$, { refCount: false }),
    );

    const res = await firstValueFrom(stream$);
    const res2 = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });
    expect(res2).toEqual({ input: 1, count: 1 });
  });

  it('dont buffer last value without active subscriber and refCount:true', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), publishWhile(active$));

    const res = await firstValueFrom(stream$);
    const res2 = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });
    expect(res2).toEqual({ input: 1, count: 2 });
  });

  it('buffer last value with active subscriber', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), publishWhile(active$));
    stream$.subscribe();

    const res = await firstValueFrom(stream$);
    const res2 = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });
    expect(res2).toEqual({ input: 1, count: 1 });
  });

  it('after flush active subscriber will get new value', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), publishWhile(active$));
    const results: { input: number; count: number }[] = [];

    stream$.subscribe((value) => results.push(value));

    active$.next(false);
    active$.next(true);

    expect(results).toEqual([
      { input: 1, count: 1 },
      { input: 1, count: 2 },
    ]);
  });

  it('after active:true (without active:false) active subscriber will get new value', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), publishWhile(active$));
    const results: { input: number; count: number }[] = [];

    stream$.subscribe((value) => results.push(value));

    active$.next(true);

    expect(results).toEqual([
      { input: 1, count: 1 },
      { input: 1, count: 2 },
    ]);
  });

  it('after flush new subscriber will get new value', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = (input: number) => of({ input, count: ++count });
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(switchMap(doRequest), publishWhile(active$));

    const res = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });

    active$.next(false);
    active$.next(true);

    const res2 = await firstValueFrom(merge(stream$, of(0).pipe(delay(100))));

    expect(res2).toEqual({ input: 1, count: 2 });
  });

  it('active: true will not materialize stream without subscribers', async () => {
    const source$ = new BehaviorSubject<number>(1);
    let count = 0;
    const doRequest = jest.fn((input: number) => of({ input, count: ++count }));
    const active$ = new BehaviorSubject<boolean>(true);

    const stream$ = source$.pipe(
      switchMap(doRequest),
      publishWhile(active$, { refCount: false }),
    );

    const res = await firstValueFrom(stream$);

    expect(res).toEqual({ input: 1, count: 1 });
    expect(doRequest.mock.calls.length).toEqual(1);

    active$.next(false);
    active$.next(true);

    expect(doRequest.mock.calls.length).toEqual(1);

    const res2 = await firstValueFrom(stream$);

    expect(res2).toEqual({ input: 1, count: 2 });
    expect(doRequest.mock.calls.length).toEqual(2);
  });
});
