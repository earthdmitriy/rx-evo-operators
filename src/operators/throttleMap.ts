import {
  ObservableInput,
  ObservedValueOf,
  OperatorFunction,
  Subscriber,
} from 'rxjs';
import { innerFrom } from 'rxjs/internal/observable/innerFrom';
import { createOperatorSubscriber } from 'rxjs/internal/operators/OperatorSubscriber';
import { operate } from 'rxjs/internal/util/lift';

export const throttleMap = <T, R, O extends ObservableInput<any>>(
  project: (value: T, index: number) => O,
): OperatorFunction<T, ObservedValueOf<O> | R> =>
  operate((source, subscriber) => {
    let innerSubscriber: Subscriber<ObservedValueOf<O>> | null = null;
    let index = 0;
    let latestValue: T[] = [];
    // Whether or not the source subscription has completed
    let isComplete = false;

    // We only complete the result if the source is complete AND we don't have an active inner subscription.
    // This is called both when the source completes and when the inners complete.
    const checkComplete = () =>
      isComplete && !innerSubscriber && subscriber.complete();

    const subscribeToProjection = (inputValue: T, outerIndex: number) => {
      // Cancel the previous inner subscription if there was one
      innerSubscriber?.unsubscribe();
      innerFrom(project(inputValue, outerIndex)).subscribe(
        (innerSubscriber = createOperatorSubscriber(
          subscriber,
          // When we get a new inner value, next it through. Note that this is
          // handling the deprecate result selector here. This is because with this architecture
          // it ends up being smaller than using the map operator.
          (v) => {
            if (outerIndex === index) {
              // no new inputs, emit result
              subscriber.next(v);
            } else {
              // new inputs, unsubscribe and project new value
              subscribeToProjection(latestValue[0], index);
            }
          },
          () => {
            innerSubscriber = null;
            if (outerIndex !== index) {
              // new inputs, project new value
              subscribeToProjection(latestValue[0], index);
            } else {
              checkComplete();
            }
          },
        )),
      );
    };

    source.subscribe(
      createOperatorSubscriber(
        subscriber,
        (value) => {
          latestValue[0] = value;

          const outerIndex = ++index;

          if (innerSubscriber) return;
          // Start the next inner subscription
          subscribeToProjection(value, outerIndex);
        },
        () => {
          isComplete = true;
          checkComplete();
        },
      ),
    );
  });
