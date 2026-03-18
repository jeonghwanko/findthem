import { logger } from "../../lib/logger";

export type State = {
  stateMachine: StateMachine;
  name: string;
  onEnter?: (args: unknown[]) => void;
  onUpdate?: () => void;
};

export class StateMachine {
  #id: string;
  #states: Map<string, State>;
  #currentState: State | undefined;
  #isChangingState: boolean;
  #changingStateQueue: { state: string; args: unknown[] }[];

  /**
   * @param {string} [id] the unique identifier for this state machine instance.
   */
  constructor(id?: string) {
    if (id === undefined) {
      this.#id = Phaser.Math.RND.uuid();
    } else {
      this.#id = id;
    }
    this.#isChangingState = false;
    this.#changingStateQueue = [];
    this.#currentState = undefined;
    this.#states = new Map();
  }

  /** @type {string | undefined} */
  get currentStateName() {
    return this.#currentState?.name;
  }

  /**
   * Used for processing any queued states and is meant to be called during every step of our game loop.
   * @returns {void}
   */
  public update(): void {
    const queuedState = this.#changingStateQueue.shift();
    if (queuedState !== undefined) {
      this.setState(queuedState.state, ...queuedState.args);
    }

    if (this.#currentState && this.#currentState.onUpdate) {
      this.#currentState.onUpdate();
    }
  }

  /**
   * Changes the current state machine to the state that is associated with the provided state name and then calls
   * the states on enter method, if it exists.
   * @param {string} name - the name of the state to change to
   * @param {...unknown} args - optional array of data to be passed to the on enter method
   * @returns {void}
   */
  public setState(name: string, ...args: unknown[]): void {
    if (!this.#states.has(name)) {
      logger.warn(`StateMachine-${this.#id}`, "setState", `tried to change to unknown state: ${name}`);
      return;
    }

    if (this.#isCurrentState(name)) {
      return;
    }

    if (this.#isChangingState) {
      this.#changingStateQueue.push({ state: name, args });
      return;
    }

    this.#isChangingState = true;
    logger.logStateChange(this.#id, this.#currentState?.name, name);

    this.#currentState = this.#states.get(name) as State;

    if (this.#currentState.onEnter) {
      logger.logStateEnter(this.#id, this.#currentState.name);
      this.#currentState.onEnter(args);
    }

    this.#isChangingState = false;
  }

  /**
   * Adds a new state to the current state machine instance. If a state already exists with the given name
   * that previous state will be replaced with the new state that was provided.
   * @param {State} state
   * @returns {void}
   */
  public addState(state: State): void {
    state.stateMachine = this;
    this.#states.set(state.name, state);
  }

  /**
   * Checks to see if the provided state name is the state that is currently being handled by the state machine instance.
   * @param {string} name
   * @returns {boolean}
   */
  #isCurrentState(name: string): boolean {
    if (!this.#currentState) {
      return false;
    }
    return this.#currentState.name === name;
  }
}
