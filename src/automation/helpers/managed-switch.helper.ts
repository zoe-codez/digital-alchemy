import { PICK_ENTITY } from "../../hass";
import { CronExpression, TBlackHole, TContext } from "../../utilities";

export type PickASwitch =
  | PICK_ENTITY<"switch">
  | { entity_id: PICK_ENTITY<"switch"> };
type EntityUpdate =
  | PICK_ENTITY
  | { entity_id: PICK_ENTITY }
  | {
      onUpdate: (callback: () => TBlackHole) => void;
      state: unknown;
      name: string;
    };

export interface ManagedSwitchOptions {
  /**
   * Logging context
   */
  context: TContext;
  /**
   * Set the state of this switch
   */
  entity_id: PickASwitch | PickASwitch[];
  /**
   * cron compatible expression
   *
   * Default: EVERY_10_MINUTES
   */
  schedule?: CronExpression | `${CronExpression}` | string;
  /**
   * Check on update of this entity
   */
  onUpdate?: EntityUpdate | EntityUpdate[];
  /**
   * - return true for on
   * - return false for off
   * - return undefined for no change
   *
   * Cannot be a promise
   */
  shouldBeOn: () => boolean | undefined;
}
