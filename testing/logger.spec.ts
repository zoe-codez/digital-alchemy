import chalk from "chalk";
import dayjs from "dayjs";

import {
  ApplicationDefinition,
  createMockLogger,
  OptionalModuleConfiguration,
  ServiceMap,
  TestRunner,
} from "../src";

describe("Logger", () => {
  let application: ApplicationDefinition<ServiceMap, OptionalModuleConfiguration>;

  afterEach(async () => {
    if (application) {
      await application.teardown();
      application = undefined;
    }
    jest.restoreAllMocks();
  });

  describe("Configuration Interactions", () => {
    it("calls the appropriate things based on permission combos", async () => {
      expect.assertions(1);

      const customLogger = createMockLogger();
      await TestRunner()
        .setOptions({ customLogger })
        .run(({ internal, logger }) => {
          internal.boilerplate.configuration.set("boilerplate", "LOG_LEVEL", "warn");
          logger.fatal("HIT");
          expect(customLogger.fatal).toHaveBeenCalled();
        });
    });

    it("updates onPostConfig", async () => {
      expect.assertions(1);

      await TestRunner().run(({ internal, lifecycle }) => {
        const spy = jest.spyOn(internal.boilerplate.logger, "updateShouldLog");
        lifecycle.onReady(() => {
          expect(spy).toHaveBeenCalled();
        });
      });
    });

    it("updates when LOG_LEVEL changes", async () => {
      expect.assertions(1);

      await TestRunner().run(({ internal }) => {
        const spy = jest.spyOn(internal.boilerplate.logger, "updateShouldLog");
        internal.boilerplate.configuration.set("boilerplate", "LOG_LEVEL", "warn");
        expect(spy).toHaveBeenCalled();
      });
    });
  });

  describe("Pretty Formatting", () => {
    const frontDash = " - ";
    let YELLOW_DASH: string;
    let BLUE_TICK: string;

    beforeAll(async () => {
      YELLOW_DASH = chalk.yellowBright(frontDash);
      BLUE_TICK = chalk.blue(`>`);
    });

    it("should default to pretty formatting", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal }) => {
        expect(internal.boilerplate.logger.getPrettyFormat()).toBe(true);
      });
    });

    it("should return the original message if it exceeds MAX_CUTOFF", async () => {
      expect.assertions(1);

      await TestRunner().run(({ internal: { boilerplate } }) => {
        const longMessage = "a".repeat(2001);
        expect(boilerplate.logger.prettyFormatMessage(longMessage)).toBe(longMessage);
      });
    });

    it('should highlight ">" in blue between square brackets', async () => {
      expect.assertions(1);

      await TestRunner().run(({ internal: { boilerplate } }) => {
        const message = "[A] > [B] > [C]";
        const expected = `${chalk.bold.magenta("A")} ${BLUE_TICK} ${chalk.bold.magenta("B")} ${BLUE_TICK} ${chalk.bold.magenta("C")}`;
        expect(boilerplate.logger.prettyFormatMessage(message)).toBe(expected);
      });
    });

    it("should strip brackets and highlight text in magenta", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal: { boilerplate } }) => {
        const message = "[Text]";
        const expected = chalk.bold.magenta("Text");
        expect(boilerplate.logger.prettyFormatMessage(message)).toBe(expected);
      });
    });

    it("should strip braces and highlight text in gray", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal: { boilerplate } }) => {
        const message = "{Text}";
        const expected = chalk.bold.gray("Text");
        expect(boilerplate.logger.prettyFormatMessage(message)).toBe(expected);
      });
    });

    it("should highlight dash at the start of the message in yellow", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal: { boilerplate } }) => {
        const message = " - Text";
        const expected = `${YELLOW_DASH}Text`;
        expect(boilerplate.logger.prettyFormatMessage(message)).toBe(expected);
      });
    });
  });

  describe("Fine Tuning", () => {
    it("provides access base logger", async () => {
      expect.assertions(1);
      const logger = createMockLogger();
      await TestRunner()
        .setOptions({ customLogger: logger })
        .run(({ internal }) => {
          expect(internal.boilerplate.logger.getBaseLogger()).toStrictEqual(logger);
        });
    });

    it("can modify base logger", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal }) => {
        const logger = createMockLogger();
        internal.boilerplate.logger.setBaseLogger(logger);
        expect(internal.boilerplate.logger.getBaseLogger()).toBe(logger);
      });
    });

    it("can modify pretty format", async () => {
      expect.assertions(1);
      await TestRunner().run(({ internal }) => {
        internal.boilerplate.logger.setPrettyFormat(false);
        expect(internal.boilerplate.logger.getPrettyFormat()).toBe(false);
      });
    });

    it("allows timestamp format to be configured", async () => {
      const format = "ddd HH:mm:ss";
      jest.spyOn(global.console, "error").mockImplementation(() => {});
      jest.spyOn(global.console, "log").mockImplementation(() => {});

      await TestRunner()
        .setOptions({
          emitLogs: true,
          loggerOptions: { timestampFormat: format },
        })
        .run(({ logger }) => {
          const spy = jest.spyOn(dayjs.prototype, "format").mockImplementation(() => "timestamp");
          logger.info(`test`);
          expect(spy).toHaveBeenCalledWith(format);
        });
    });
  });
});