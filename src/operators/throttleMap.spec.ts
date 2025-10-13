import { concat, defer, firstValueFrom, Observable, of } from 'rxjs';
import {
  delay,
  map,
  retry,
  switchMap,
  take,
  takeWhile,
  toArray,
} from 'rxjs/operators';
import { TestScheduler } from 'rxjs/testing';
import { throttleMap } from './throttleMap';

/** @test {throttleMap} */
describe('throttleMap', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('validate test', async () => {
    const source = of(1, 2, 3);

    const res = await firstValueFrom(
      source.pipe(
        switchMap((x) => of(x * 2).pipe(delay(1))),
        toArray(),
      ),
    );

    expect(res).toEqual([6]);
  });

  it('simple test', async () => {
    const source = of(1, 2, 3);

    const res = await firstValueFrom(
      source.pipe(
        throttleMap((x) => of(x * 2).pipe(delay(1))),
        toArray(),
      ),
    );

    expect(res).toEqual([6]);
  });

  it('simple test2', async () => {
    const source = of(1, 2, 3);

    const res = await firstValueFrom(
      source.pipe(
        throttleMap((x) => of(x * 2)),
        toArray(),
      ),
    );

    expect(res).toEqual([2, 4, 6]);
  });

  it('works with retry', async () => {
    const source = of(1);

    let attempt = 0;

    const doRequest = (input: number) => {
      attempt++;
      if (attempt < 3) {
        throw 'err';
      }
      return of(input * 10);
    };

    const res = await firstValueFrom(
      source.pipe(throttleMap(doRequest), retry(5), toArray()),
    );

    expect(attempt).toEqual(3);
    expect(res).toEqual([10]);
  });

  it('simple marbles', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const e1 = hot('   --1-2--------------|');
        const e1subs = '   ^------------------!';
        const e2 = cold('    x|            ', { x: 10 });
        //                         x-x-x|
        //                            x-x-x|
        const expected = ' --x-y--------------|';
        const values = { x: 10, y: 20 };

        const result = e1.pipe(throttleMap((x) => e2.pipe(map((i) => i * +x))));

        expectObservable(result).toBe(expected, values);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('skip values', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const e1 = hot('   --1-2-3-4----------|');
        const e1subs = '   ^------------------!';
        const e2 = cold('    --x|            ', { x: 10 });
        //                         x-x-x|
        //                            x-x-x|
        const expected = ' ----------x--------|';
        const values = { x: 40 };

        const result = e1.pipe(throttleMap((x) => e2.pipe(map((i) => i * +x))));

        expectObservable(result).toBe(expected, values);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('skip values2', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const e1 = hot('   --1-2-3-4-----5----|');
        const e1subs = '   ^------------------!';
        const e2 = cold('    --x|            ', { x: 10 });
        const expected = ' ----------x-----y--|';
        const values = { x: 40, y: 50 };

        const result = e1.pipe(throttleMap((x) => e2.pipe(map((i) => i * +x))));

        expectObservable(result).toBe(expected, values);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should map-and-flatten each item to an Observable', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const e1 = hot('   --1-----3--5-------|');
        const e1subs = '   ^------------------!';
        const e2 = cold('    x-x-x|            ', { x: 10 });
        //                         x-x-x|
        //                            x-x-x|

        // switchMap ' --x-x-x-y-yz-z-z---|';
        const expected = ' --x-x-x-y-y-z-z-z--|';
        const values = { x: 10, y: 30, z: 50 };

        const result = e1.pipe(throttleMap((x) => e2.pipe(map((i) => i * +x))));

        expectObservable(result).toBe(expected, values);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should unsub inner observables', () => {
    const unsubbed: string[] = [];

    of('a', 'b')
      .pipe(
        throttleMap(
          (x) =>
            new Observable<string>((subscriber) => {
              subscriber.complete();
              return () => {
                unsubbed.push(x);
              };
            }),
        ),
      )
      .subscribe();

    expect(unsubbed).toEqual(['a', 'b']);
  });

  it('should raise error when projection throws', () => {
    testScheduler.run(({ hot, expectObservable, expectSubscriptions }) => {
      const e1 = hot('  -------x-----y---|');
      const e1subs = '  ^------!          ';
      const expected = '-------#          ';
      const project = () => {
        throw 'error';
      };

      expectObservable(e1.pipe(throttleMap(project))).toBe(expected);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should stop listening to a synchronous observable when unsubscribed', () => {
    const sideEffects: number[] = [];
    const synchronousObservable = concat(
      defer(() => {
        sideEffects.push(1);
        return of(1);
      }),
      defer(() => {
        sideEffects.push(2);
        return of(2);
      }),
      defer(() => {
        sideEffects.push(3);
        return of(3);
      }),
    );

    of(null)
      .pipe(
        throttleMap(() => synchronousObservable),
        takeWhile((x) => x != 2), // unsubscribe at the second side-effect
      )
      .subscribe(() => {});

    expect(sideEffects).toEqual([1, 2]);
  });

  it('should switch inner cold observables, one inner throws', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const x = cold('           --a--b--#--d--e--|          ');
        const xsubs = '   ---------^-------!                   ';
        const y = cold('                     ---f---g---h---i--');
        const ysubs = '                                        ';
        const e1 = hot('  ---------x---------y---------|       ');
        const e1subs = '  ^----------------!                   ';
        const expected = '-----------a--b--#                   ';

        const observableLookup: Record<string, Observable<string>> = {
          x: x,
          y: y,
        };

        const result = e1.pipe(throttleMap((value) => observableLookup[value]));

        expectObservable(result).toBe(expected);
        expectSubscriptions(x.subscriptions).toBe(xsubs);
        expectSubscriptions(y.subscriptions).toBe(ysubs);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should switch inner hot observables', () => {
    testScheduler.run(({ hot, expectObservable, expectSubscriptions }) => {
      const x = hot('   -----a--b--c--d--e--|                 ');
      const xsubs = '   ---------^----------!                  ';
      const y = hot('   --p-o-o-p-------------f---g---h---i--|');
      const ysubs = '   --------------------^----------------!';
      const e1 = hot('  ---------x---------y---------|        ');
      const e1subs = '  ^----------------------------!        ';
      const expected = '-----------c--d--e----f---g---h---i--|';

      const observableLookup: Record<string, Observable<string>> = {
        x: x,
        y: y,
      };

      const result = e1.pipe(throttleMap((value) => observableLookup[value]));

      expectObservable(result).toBe(expected);
      expectSubscriptions(x.subscriptions).toBe(xsubs);
      expectSubscriptions(y.subscriptions).toBe(ysubs);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should switch inner empty and empty', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const x = cold('           |                    ');
        const y = cold('                     |          ');
        const xsubs = '   ---------(^!)                 ';
        const ysubs = '   -------------------(^!)       ';
        const e1 = hot('  ---------x---------y---------|');
        const e1subs = '  ^----------------------------!';
        const expected = '-----------------------------|';

        const observableLookup: Record<string, Observable<string>> = {
          x: x,
          y: y,
        };

        const result = e1.pipe(throttleMap((value) => observableLookup[value]));

        expectObservable(result).toBe(expected);
        expectSubscriptions(x.subscriptions).toBe(xsubs);
        expectSubscriptions(y.subscriptions).toBe(ysubs);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should switch inner empty and never', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const x = cold('           |                    ');
        const y = cold('                     -          ');
        const xsubs = '   ---------(^!)                 ';
        const ysubs = '   -------------------^          ';
        const e1 = hot('  ---------x---------y---------|');
        const e1subs = '  ^----------------------------!';
        const expected = '------------------------------';

        const observableLookup: Record<string, Observable<string>> = {
          x: x,
          y: y,
        };

        const result = e1.pipe(throttleMap((value) => observableLookup[value]));

        expectObservable(result).toBe(expected);
        expectSubscriptions(x.subscriptions).toBe(xsubs);
        expectSubscriptions(y.subscriptions).toBe(ysubs);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should switch inner empty and throw', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const x = cold('           |                    ');
        const y = cold('                     #          ', undefined, 'sad');
        const xsubs = '   ---------(^!)                 ';
        const ysubs = '   -------------------(^!)       ';
        const e1 = hot('  ---------x---------y---------|');
        const e1subs = '  ^------------------!          ';
        const expected = '-------------------#          ';

        const observableLookup: Record<string, Observable<string>> = {
          x: x,
          y: y,
        };

        const result = e1.pipe(throttleMap((value) => observableLookup[value]));

        expectObservable(result).toBe(expected, undefined, 'sad');
        expectSubscriptions(x.subscriptions).toBe(xsubs);
        expectSubscriptions(y.subscriptions).toBe(ysubs);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should handle outer empty', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const e1 = cold(' |   ');
      const e1subs = '  (^!)';
      const expected = '|   ';

      const result = e1.pipe(throttleMap((value) => of(value)));

      expectObservable(result).toBe(expected);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer never', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const e1 = cold(' -');
      const e1subs = '  ^';
      const expected = '-';

      const result = e1.pipe(throttleMap((value) => of(value)));

      expectObservable(result).toBe(expected);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer throw', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      const e1 = cold(' #   ');
      const e1subs = '  (^!)';
      const expected = '#   ';

      const result = e1.pipe(throttleMap((value) => of(value)));

      expectObservable(result).toBe(expected);
      expectSubscriptions(e1.subscriptions).toBe(e1subs);
    });
  });

  it('should handle outer error', () => {
    testScheduler.run(
      ({ hot, cold, expectObservable, expectSubscriptions }) => {
        const x = cold('           --a--b--c--d--e--|');
        const xsubs = '   ---------^---------!       ';
        const e1 = hot('  ---------x---------#       ');
        const e1subs = '  ^------------------!       ';
        const expected = '-----------a--b--c-#       ';

        const observableLookup: Record<string, Observable<string>> = { x: x };

        const result = e1.pipe(throttleMap((value) => observableLookup[value]));

        expectObservable(result).toBe(expected);
        expectSubscriptions(x.subscriptions).toBe(xsubs);
        expectSubscriptions(e1.subscriptions).toBe(e1subs);
      },
    );
  });

  it('should stop listening to a synchronous observable when unsubscribed', () => {
    const sideEffects: number[] = [];
    const synchronousObservable = new Observable<number>((subscriber) => {
      // This will check to see if the subscriber was closed on each loop
      // when the unsubscribe hits (from the `take`), it should be closed
      for (let i = 0; !subscriber.closed && i < 10; i++) {
        sideEffects.push(i);
        subscriber.next(i);
      }
    });

    synchronousObservable
      .pipe(
        throttleMap((value) => of(value)),
        take(3),
      )
      .subscribe(() => {
        /* noop */
      });

    expect(sideEffects).toEqual([0, 1, 2]);
  });
});
