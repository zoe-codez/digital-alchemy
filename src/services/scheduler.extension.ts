import dayjs from "dayjs";
import { schedule } from "node-cron";

import { is, TContext } from "..";
import {
  BootstrapException,
  SchedulerBuilder,
  SchedulerCronOptions,
  ScheduleRemove,
  SchedulerIntervalOptions,
  SchedulerSlidingOptions,
  TServiceParams,
} from "../helpers";

export function Scheduler({ logger, lifecycle, internal }: TServiceParams): SchedulerBuilder {
  const stop = new Set<ScheduleRemove>();

  // #MARK: lifecycle events
  lifecycle.onPreShutdown(function onPreShutdown() {
    if (is.empty(stop)) {
      return;
    }
    logger.info({ name: onPreShutdown }, `removing [%s] schedules`, stop.size);
    stop.forEach(stopFunctions => {
      stopFunctions();
      stop.delete(stopFunctions);
    });
  });

  return (context: TContext) => {
    // #MARK: cron
    function cron({ exec, schedule: scheduleList }: SchedulerCronOptions) {
      const stopFunctions: ScheduleRemove[] = [];
      [scheduleList].flat().forEach(cronSchedule => {
        logger.trace({ context, name: cron, schedule: cronSchedule }, `init`);
        const cronJob = schedule(cronSchedule, async () => await internal.safeExec(exec));
        lifecycle.onReady(() => {
          logger.trace({ context, name: cron, schedule: cronSchedule }, "starting");
          cronJob.start();
        });

        const stopFunction = () => {
          logger.trace({ context, name: cron, schedule: cronSchedule }, `stopping`);
          cronJob.stop();
        };

        stop.add(stopFunction);
        stopFunctions.push(stopFunction);
        return stopFunction;
      });

      return () => stopFunctions.forEach(stop => stop());
    }

    // #MARK: interval
    function interval({ exec, interval }: SchedulerIntervalOptions) {
      let runningInterval: ReturnType<typeof setInterval>;
      lifecycle.onReady(() => {
        logger.trace({ context, name: interval }, "starting");

        runningInterval = setInterval(async () => await internal.safeExec(exec), interval);
      });
      const stopFunction = () => {
        if (runningInterval) {
          clearInterval(runningInterval);
        }
      };
      stop.add(stopFunction);
      return stopFunction;
    }

    // #MARK: sliding
    function sliding({ exec, reset, next }: SchedulerSlidingOptions) {
      if (!is.function(next)) {
        throw new BootstrapException(
          context,
          "BAD_NEXT",
          "Did not provide next function to schedule.sliding",
        );
      }
      if (!is.function(exec)) {
        throw new BootstrapException(
          context,
          "BAD_NEXT",
          "Did not provide exec function to schedule.sliding",
        );
      }
      let timeout: ReturnType<typeof setTimeout>;

      const waitForNext = () => {
        if (timeout) {
          logger.warn(
            { context, name: sliding },
            `sliding schedule retrieving next execution time before previous ran`,
          );
          clearTimeout(timeout);
        }
        let nextTime = next();
        if (!nextTime) {
          // nothing to do?
          // will try again next schedule
          return;
        }
        nextTime = dayjs(nextTime);
        if (dayjs().isAfter(nextTime)) {
          // probably a result of boot
          // ignore
          return;
        }
        if (nextTime) {
          timeout = setTimeout(
            async () => {
              await internal.safeExec(exec);
            },
            Math.abs(dayjs().diff(nextTime, "ms")),
          );
        }
      };
      // reset on schedule
      const scheduleStop = cron({
        exec: waitForNext,
        schedule: reset,
      });
      // find value for now (boot)
      lifecycle.onReady(() => waitForNext());

      return () => {
        scheduleStop();
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
      };
    }

    return {
      cron,
      interval,
      sliding,
    };
  };
}
