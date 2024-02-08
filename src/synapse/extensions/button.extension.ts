import { InternalError, TServiceParams } from "../../boilerplate";
import { PICK_ENTITY } from "../../hass";
import { BadRequestError, GENERIC_SUCCESS_RESPONSE } from "../../server";
import { is, TBlackHole, TContext, ZCC } from "../../utilities";
import {
  BUTTON_ERRORS,
  BUTTON_EXECUTION_COUNT,
  BUTTON_EXECUTION_TIME,
  MaterialIcon,
  MaterialIconTags,
} from "..";

type TButton<TAG extends MaterialIconTags = MaterialIconTags> = {
  exec: () => TBlackHole;
  context: TContext;
  label?: string;
  icon?: MaterialIcon<TAG>;
  id: string;
  name?: string;
};

export function Button({
  logger,
  lifecycle,
  server,
  synapse,
  context: parentContext,
}: TServiceParams) {
  const registry = new Map<PICK_ENTITY<"button">, TButton>();
  lifecycle.onBootstrap(() => BindHTTP());

  function BindHTTP() {
    const fastify = server.bindings.httpServer;
    // # Receive button press
    fastify.post<{
      Body: { button: PICK_ENTITY<"button"> };
    }>(`/synapse/button`, synapse.http.validation, async function (request) {
      const button = request.body.button;
      if (!registry.has(button)) {
        throw new BadRequestError(
          parentContext,
          "INVALID_BUTTON",
          `${button} is not registered`,
        );
      }
      logger.debug({ button }, `received button press`);
      const { exec, context, label } = registry.get(button);
      setImmediate(async () => {
        await ZCC.safeExec({
          duration: BUTTON_EXECUTION_TIME,
          errors: BUTTON_ERRORS,
          exec: async () => await exec(),
          executions: BUTTON_EXECUTION_COUNT,
          labels: { context, label },
        });
      });
      return GENERIC_SUCCESS_RESPONSE;
    });

    // # List buttons
    fastify.get("/synapse/button", synapse.http.validation, () => {
      logger.trace(`list buttons`);
      return {
        buttons: [...registry.values()].map(({ icon, id, name }) => {
          return { icon, id, name };
        }),
      };
    });
  }

  /**
   *  # Register a new button
   */
  function create<TAG extends MaterialIconTags = MaterialIconTags>(
    entity: TButton<TAG>,
  ) {
    if (!is.domain(entity.id, "button")) {
      throw new InternalError(
        parentContext,
        "INVALID_ID",
        "pass an entity id with a button domain",
      );
    }
    if (registry.has(entity.id)) {
      throw new InternalError(
        parentContext,
        "DUPLICATE_BUTTON",
        `${entity.id} is already in use`,
      );
    }
    logger.debug({ entity }, `register entity`);
    registry.set(entity.id, entity);
  }
  return create;
}
