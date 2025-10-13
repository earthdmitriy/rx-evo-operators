import {
  MonoTypeOperatorFunction,
  Observable,
  Subject,
  Subscription,
} from 'rxjs';

/**
 * @param active$
 * When false - clear buffer and don't emit any events. Rx streams don't completes and any subscribers cna wait till stream become active.
 * When true - stream become active and materialize data when someone subscribes.
 * @param options
 * @see ShareReplay options
 * by default { bufferSize = 1, refCount = true }
 * @returns
 */
export const publishWhile =
  <T>(
    active$: Observable<boolean>,
    options?: { bufferSize?: number; refCount?: boolean },
  ): MonoTypeOperatorFunction<T> =>
  (source: Observable<T>): Observable<T> => {
    const { bufferSize = 1, refCount = true } = options ?? {};
    const subject = new Subject<T>();
    const buffer: T[] = [];

    let isActive = false;

    let activeSubscribers = 0;

    let availabilitySubscription: Subscription | null = null;
    let sourceSubscription: Subscription | null = null;

    const clear = () => {
      sourceSubscription?.unsubscribe();
      sourceSubscription = null;
      buffer.length = 0;
    };

    const subscribeToSource = () => {
      sourceSubscription?.unsubscribe();
      sourceSubscription = source.subscribe({
        next(value: T) {
          buffer.push(value);
          // remove outdated data
          if (buffer.length > bufferSize) {
            buffer.shift();
          }
          subject.next(value);
        },
        error(err: unknown) {
          subject.error(err);
        },
        complete() {
          subject.complete();
        },
      });
    };
    const subscribeToAvailability = () => {
      availabilitySubscription?.unsubscribe();
      availabilitySubscription = active$.subscribe((available) => {
        isActive = available;
        if (available) {
          if (activeSubscribers) subscribeToSource();
        } else {
          clear();
        }
      });
    };

    // return Observable, that share data
    return new Observable<T>((subscriber) => {
      activeSubscribers++;

      const innerSubscription: Subscription = subject.subscribe(subscriber);
      if (!availabilitySubscription) {
        subscribeToAvailability();
      } else {
        // send value from buffer to new subscriber
        buffer.forEach((value) => subscriber.next(value));
      }
      if (isActive && !sourceSubscription) {
        subscribeToSource();
      }

      // return unsubscribe function
      return () => {
        activeSubscribers--;
        innerSubscription.unsubscribe();

        if (!activeSubscribers && (!isActive || refCount)) {
          clear();

          availabilitySubscription?.unsubscribe();
          availabilitySubscription = null;
        }
      };
    });
  };
