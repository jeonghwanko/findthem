import * as Phaser from "phaser";
import { InputComponent } from "./input-component";

export class KeyboardComponent extends InputComponent {
  #turnKey: Phaser.Input.Keyboard.Key; // A key - 방향 전환
  #moveKey: Phaser.Input.Keyboard.Key; // S key - 전진
  #attackKey: Phaser.Input.Keyboard.Key; // D key - 공격
  #actionKey: Phaser.Input.Keyboard.Key; // X key - 기타 액션
  #enterKey: Phaser.Input.Keyboard.Key; // Enter key

  // Simulation flags for mobile input
  #simulatedTurnPress = false;
  #simulatedMovePress = false;
  #simulatedAttackPress = false;

  constructor(keyboardPlugin: Phaser.Input.Keyboard.KeyboardPlugin) {
    super();
    this.#turnKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.#moveKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.#attackKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.#actionKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.#enterKey = keyboardPlugin.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // A = Turn direction + Move forward (방향 전환 + 전진)
    // S = Move forward in current direction (현재 방향으로 전진)
    // D = Attack (공격)
    // X = Action (기타 액션)
    // Enter = Start, Open Inventory
  }

  // New input methods for the new control scheme
  get isTurnKeyJustDown(): boolean {
    const keyDown = Phaser.Input.Keyboard.JustDown(this.#turnKey);
    const simulated = this.#simulatedTurnPress;
    if (simulated) {
      this.#simulatedTurnPress = false; // Reset simulation flag
    }
    return keyDown || simulated;
  }

  get isMoveKeyJustDown(): boolean {
    const keyDown = Phaser.Input.Keyboard.JustDown(this.#moveKey);
    const simulated = this.#simulatedMovePress;
    if (simulated) {
      this.#simulatedMovePress = false; // Reset simulation flag
    }
    return keyDown || simulated;
  }

  get isAttackKeyJustDown(): boolean {
    const keyDown = Phaser.Input.Keyboard.JustDown(this.#attackKey);
    const simulated = this.#simulatedAttackPress;
    if (simulated) {
      this.#simulatedAttackPress = false; // Reset simulation flag
    }
    return keyDown || simulated;
  }

  get isActionKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#actionKey);
  }

  get isEnterKeyJustDown(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.#enterKey);
  }

  // Deprecated methods - keeping for compatibility during transition
  get isUpDown(): boolean {
    return false; // No longer used
  }

  get isUpJustDown(): boolean {
    return false; // No longer used
  }

  get isDownDown(): boolean {
    return false; // No longer used
  }

  get isDownJustDown(): boolean {
    return false; // No longer used
  }

  get isLeftDown(): boolean {
    return false; // No longer used
  }

  get isRightDown(): boolean {
    return false; // No longer used
  }

  get isSelectKeyJustDown(): boolean {
    return false; // No longer used
  }

  // Mobile input simulation methods
  simulateTurnKeyPress(): void {
    this.#simulatedTurnPress = true;
  }

  simulateMoveKeyPress(): void {
    this.#simulatedMovePress = true;
  }

  simulateAttackKeyPress(): void {
    this.#simulatedAttackPress = true;
  }
}
