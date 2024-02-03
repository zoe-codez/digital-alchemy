import { TServiceParams } from "@zcc/boilerplate";
import {
  domain,
  ENTITY_STATE,
  LIB_HOME_ASSISTANT,
  PICK_ENTITY,
} from "@zcc/hass";
import { CronExpression, each, is } from "@zcc/utilities";

import { LIB_AUTOMATION_LOGIC } from "../automation-logic.module";
import {
  AGGRESSIVE_SCENES_ADJUSTMENT,
  AggressiveScenesAdjustmentData,
  RoomScene,
  SceneDefinition,
  SceneSwitchState,
} from "../helpers";

export function AggressiveScenes({
  logger,
  lifecycle,
  getApis,
  scheduler,
  event,
  context,
}: TServiceParams) {
  let aggressiveScenes = false;

  const hass = getApis(LIB_HOME_ASSISTANT);
  const automation = getApis(LIB_AUTOMATION_LOGIC);

  lifecycle.onPostConfig(() => {
    aggressiveScenes = LIB_AUTOMATION_LOGIC.getConfig("AGGRESSIVE_SCENES");
  });

  scheduler.cron({
    context,
    exec: async () => {
      try {
        // await each([...SceneRoomService.loaded.keys()], async name => {
        //   await validateRoomScene(name);
        // });
      } catch (error) {
        logger.error({ error });
      }
    },
    schedule: CronExpression.EVERY_30_SECONDS,
  });

  async function manageSwitch(
    entity: ENTITY_STATE<PICK_ENTITY<"switch">>,
    scene: SceneDefinition,
  ) {
    const entity_id = entity.entity_id as PICK_ENTITY<"switch">;
    const expected = scene[entity_id] as SceneSwitchState;
    if (is.empty(expected)) {
      // ??
      return;
    }
    if (entity.state === "unavailable") {
      logger.warn(
        { name: entity_id },
        `{unavailable} entity, cannot manage state`,
      );
      return;
    }
    let performedUpdate = false;
    if (entity.state !== expected.state) {
      await matchSwitchToScene(entity, expected);
      performedUpdate = true;
    }
    if (performedUpdate) {
      return;
    }
    if (!is.empty(entity.attributes.entity_id)) {
      // ? This is a group
      await each(entity.attributes.entity_id, async child_id => {
        const child = hass.entity.byId(child_id);
        if (!child) {
          logger.warn(
            `%s => %s child entity of group cannot be found`,
            entity_id,
            child_id,
          );
          return;
        }
        if (child.state !== expected.state) {
          await matchSwitchToScene(child, expected);
        }
      });
    }
  }

  async function matchSwitchToScene(
    entity: ENTITY_STATE<PICK_ENTITY<"switch">>,
    expected: SceneSwitchState,
  ) {
    const entity_id = entity.entity_id;
    logger.debug({ name: entity_id, state: expected.state }, `changing state`);
    event.emit(AGGRESSIVE_SCENES_ADJUSTMENT, {
      entity_id,
      type: "switch_on_off",
    } as AggressiveScenesAdjustmentData);
    if (expected.state === "on") {
      await hass.call.switch.turn_on({ entity_id });
      return;
    }
    await hass.call.switch.turn_off({ entity_id });
  }

  /**
   * This function should **NOT** emit logs on noop
   *
   * - errors
   * - warnings
   * - state changes
   */
  async function validateRoomScene(scene: RoomScene): Promise<void> {
    if (aggressiveScenes === false || scene?.aggressive === false) {
      // nothing to do
      return;
    }
    if (!scene.definition) {
      logger.warn({ context }, `cannot validate room scene`);
      return;
    }
    if (!is.object(scene.definition) || is.empty(scene.definition)) {
      // ? There currently is no use case for a scene with no entities in it
      // Not technically an error though
      logger.warn("no definition");
      return;
    }
    await each(
      Object.keys(scene.definition),
      async (entity_id: PICK_ENTITY) => {
        const entity = hass.entity.byId(entity_id);
        if (!entity) {
          // * Home assistant outright does not send an entity for this id
          // The wrong id was probably input
          //
          // ? This is distinct from "unavailable" entities
          logger.error({ name: entity_id }, `cannot find entity`);
          return;
        }
        const entityDomain = domain(entity_id);
        switch (entityDomain) {
          case "light":
            await automation.light.manageLight(
              entity as ENTITY_STATE<PICK_ENTITY<"light">>,
              scene.definition,
            );
            return;
          case "switch":
            await manageSwitch(entity, scene.definition as SceneDefinition);
            return;
          default:
            logger.debug({ name: entityDomain }, `so actions set for domain`);
        }
      },
    );
  }

  return {
    validateRoomScene,
  };
}
