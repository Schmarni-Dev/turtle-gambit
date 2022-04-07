import WebSocket from "ws";
import { EventEmitter } from "events";
import World from "./world";
import Names from "./names.json";
import { randomBytes } from "crypto";

export enum BlockDirection {
  FORWARD,
  UP,
  DOWN,
}
export enum Direction {
  NORTH,
  EAST,
  SOUTH,
  WEST,
}
export enum Side {
  LEFT,
  RIGHT,
}

interface Slot {
  count: number;
  name: string;
  damage: number;
}

const nonces = new Set();
function getNonce(): string {
  let nonce = "";
  while (nonce === "" || nonces.has(nonce)) {
    nonce = randomBytes(4).toString("hex");
  }
  nonces.add(nonce);
  return nonce;
}

const names = Names;

export class Turtle extends EventEmitter {
  id: number = 0;
  label: string = "";
  fuel: number = 0;
  maxFuel: number = 1;
  selectedSlot: number = 1;
  inventory: (Slot | null)[] = [];
  ws: WebSocket;
  world: World;
  x: number = 0;
  y: number = 0;
  z: number = 0;
  d: Direction = 0;
  mining: boolean = false;

  constructor(ws: WebSocket, world: World) {
    super();
    this.world = world;
    this.ws = ws;
    this.exec<string>("os.getComputerLabel()").then(async (label) => {
      if (label) {
        this.label = label;
      } else {
        let nameIndex = this.world.db.getData("/nameindex");
        this.world.db.push("/nameindex", nameIndex + 1);
        this.label = names[nameIndex];
        await this.exec(`os.setComputerLabel("${this.label}")`);
      }
      this.id = await this.exec<number>("os.getComputerID()");
      [this.x, this.y, this.z, this.d] = this.world.getTurtle(this);
      this.selectedSlot = await this.exec<number>("turtle.getSelectedSlot()");
      this.maxFuel = await this.exec<number>("turtle.getFuelLimit()");
      this.fuel = await this.exec<number>("turtle.getFuelLevel()");
      await this.updateFuel();
      await this.updateInventory();
      // console.log(this.inventory)
      this.emit("init");
    });
  }

  toJSON(): object {
    return {
      label: this.label,
      inventory: this.inventory,
      selectedSlot: this.selectedSlot,
      x: this.x,
      y: this.y,
      z: this.z,
      d: this.d,
      fuel: this.fuel,
      maxFuel: this.maxFuel,
      id: this.id,
      mining: this.mining,
    };
  }

  exec<T>(command: string): Promise<T> {
    return new Promise((r) => {
      const nonce = getNonce();
      this.ws.send(
        JSON.stringify({
          type: "eval",
          function: `return ${command}`,
          nonce,
        })
      );

      const listener = (resp: string) => {
        try {
          let res = JSON.parse(resp);
          if (res?.nonce === nonce) {
            // console.log(res)
            r(res.data);
            this.ws.off("message", listener);
          }
        } catch (e) {}
      };

      this.ws.on("message", listener);
    });
  }

  async forward(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.forward()");
    if (r) {
      this.fuel--;
      await this.updatePosition("forward");
    }
    return r;
  }
  async back(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.back()");
    if (r) {
      this.fuel--;
      await this.updatePosition("back");
    }
    return r;
  }
  async up(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.up()");
    if (r) {
      this.fuel--;
      await this.updatePosition("up");
    }
    return r;
  }
  async down(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.down()");
    if (r) {
      this.fuel--;
      await this.updatePosition("down");
    }
    return r;
  }
  async turnLeft(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.turnLeft()");
    if (r) {
      await this.updatePosition("left");
    }
    return r;
  }
  async turnRight(): Promise<boolean> {
    let r = await this.exec<boolean>("turtle.turnRight()");
    if (r) {
      await this.updatePosition("right");
    }
    return r;
  }

  private parseDirection(prefix: string, direction: BlockDirection): string {
    switch (direction) {
      case BlockDirection.FORWARD:
        return prefix;
      case BlockDirection.UP:
        return prefix + "Up";
      case BlockDirection.DOWN:
        return prefix + "Down";
    }
  }

  private async updateInventory() {
    this.inventory = await this.exec<Slot[]>(
      "{" +
        new Array(16)
          .fill(0)
          .map((_, i) => `turtle.getItemDetail(${i + 1})`)
          .join(", ") +
        "}"
    );
    // if (this.inventory === [ 'CUM' ]) {
    //   this.inventory = [];
    // }
    while (this.inventory.length < 16) {
      this.inventory.push(null);
    }
	// console.log(this.inventory)
    this.emit("update");
  }

  private async updateFuel() {
    this.emit("update");
  }

  private getDirectionDelta(dir: Direction): [number, number] {
    if (dir === Direction.NORTH) return [0, -1];
    else if (dir === Direction.EAST) return [1, 0];
    else if (dir === Direction.SOUTH) return [0, 1];
    else if (dir === Direction.WEST) return [-1, 0];
    return [0, 0];
  }

  private async updatePosition(move: string) {
    let deltas = this.getDirectionDelta(this.d);
    switch (move) {
      case "up":
        this.y++;
        break;
      case "down":
        this.y--;
        break;
      case "forward":
        this.x += deltas[0];
        this.z += deltas[1];
        break;
      case "back":
        this.x -= deltas[0];
        this.z -= deltas[1];
        break;
      case "left":
        this.d += 3;
        this.d %= 4;
        // console.log(this.d.toString());
        break;
      case "right":
        this.d++;
        this.d %= 4;
        // console.log(this.d.toString());
        break;
    }
    this.updatePos();
  }

  async updatePos() {
    this.world.updateTurtle(this, this.x, this.y, this.z, this.d);
    await this.updateBlock();
    this.emit("update");
  }

  private async updateBlock() {
    let deltas = this.getDirectionDelta(this.d);
    let { forward, up, down } = await this.exec<{
      forward: any;
      up: any;
      down: any;
    }>(
      "{down=select(2,turtle.inspectDown()), up=select(2,turtle.inspectUp()), forward=select(2,turtle.inspect())}"
    );
    this.world.updateBlock(this.x, this.y - 1, this.z, down);
    this.world.updateBlock(this.x, this.y + 1, this.z, up);
    this.world.updateBlock(
      this.x + deltas[0],
      this.y,
      this.z + deltas[1],
      forward
    );
  }

  async dig(direction: BlockDirection) {
    let r = await this.exec<boolean>(
      `turtle.${this.parseDirection("dig", direction)}()`
    );
    await this.updateInventory();
    await this.updateBlock();
    return r;
  }
  async place(direction: BlockDirection, signText?: string) {
    let r = await this.exec<boolean>(
      `turtle.${this.parseDirection("place", direction)}(${
        signText ? '"' + signText + '"' : ""
      })`
    );
    await this.updateInventory();
    await this.updateBlock();
    return r;
  }
  async dropItem(direction: BlockDirection, count?: number) {
    let r = await this.exec<boolean>(
      `turtle.${this.parseDirection("drop", direction)}(${
        typeof count === "number" ? count.toString() : ""
      })`
    );
    await this.updateInventory();
    return r;
  }
  async suckItem(direction: BlockDirection, count?: number) {
    let r = await this.exec<boolean>(
      `turtle.${this.parseDirection("suck", direction)}(${
        typeof count === "number" ? count.toString() : ""
      })`
    );
    await this.updateInventory();
    return r;
  }
  async refuel(count?: number) {
    let r = await this.exec<boolean>(
      `turtle.refuel(${typeof count === "number" ? count.toString() : ""})`
    );
    this.fuel = await this.exec<number>("turtle.getFuelLevel()");
    await this.updateInventory();
    return r;
  }
  async equip(side: "left" | "right") {
    let r;
    if (side === "left") r = await this.exec<boolean>("turtle.equipLeft()");
    else r = await this.exec<boolean>("turtle.equipRight()");
    await this.updateInventory();
    return r;
  }
  async selectSlot(slot: number) {
    if (slot > 0 && slot < 17) {
      this.selectedSlot = slot;
      let r = await this.exec<boolean>(`turtle.select(${slot})`);
      this.emit("update");
      return r;
    }
    return false;
  }
  async refresh() {
    await this.updateInventory();
    await this.updateBlock();
    this.selectedSlot = await this.exec<number>("turtle.getSelectedSlot()");
    this.maxFuel = await this.exec<number>("turtle.getFuelLimit()");
    this.fuel = await this.exec<number>("turtle.getFuelLevel()");
  }
  async moveItems(slot: number, amount: "all" | "half" | "one") {
    let max = this.inventory[this.selectedSlot - 1]?.count;
    if (max) {
      let count = 1;
      if (amount === "all") count = max;
      else if (amount === "half") count = Math.floor(max / 2);
      let r = await this.exec<boolean>(`turtle.transferTo(${slot}, ${count})`);
      await this.updateInventory();
      return r;
    }
    return false;
  }

  async craft(amount: "all" | "one") {
    let r = await this.exec<boolean>(
      `turtle.craft(${amount === "one" ? "1" : ""})`
    );
    await this.updateInventory();
    return r;
  }
  undergoMitosis(): Promise<number | null> {
    return new Promise((r) => {
      const nonce = getNonce();
      this.ws.send(
        JSON.stringify({
          type: "mitosis",
          nonce,
        })
      );

      const listener = async (resp: string) => {
        try {
          let res = JSON.parse(resp);
          if (res.nonce === nonce) {
            if (res !== null) {
              let deltas = this.getDirectionDelta(this.d);
              this.world.db.push(`/turtles/${res.data}`, [
                this.x + deltas[0],
                this.y + 1,
                this.z + deltas[1],
                this.d,
              ]);
            }
            await this.updateInventory();
            await this.updateBlock();
            this.fuel = await this.exec<number>("turtle.getFuelLevel()");
            r(res.data);
            this.ws.off("message", listener);
          }
        } catch (e) {}
      };

      this.ws.on("message", listener);
    });
  }

  goTo(
    rot1: number,
    st1: number,
    rot2: number,
    st2: number,
    st3: number
  ): void {
    const nonce = getNonce();
    this.ws.send(
      JSON.stringify({
        type: "goTo",
        rot1: rot1 || 0,
        st1: st1 || 0,
        rot2: rot2 || 0,
        st2: st2 || 0,
        st3: st3 || 0,
        nonce,
      })
    );

    const listener = async (resp: string) => {
      try {
        let res = JSON.parse(resp);
        if (res.nonce === nonce) {
          if (res.data === "end") {
            await this.updateInventory();
            await this.updateBlock();
            this.fuel = await this.exec<number>("turtle.getFuelLevel()");
            this.ws.off("message", listener);
            return;
          } else {
            if (res.move) {
              let clearBlock = false;
              if (res.move === "l") {
                this.d += 3;
                this.d %= 4;
              } else if (res.move === "r") {
                this.d += 1;
                this.d %= 4;
              } else if (res.move === "f") {
                let deltas = this.getDirectionDelta(this.d);
                this.x += deltas[0];
                this.z += deltas[1];
                clearBlock = true;
              } else if (res.move === "u") {
                this.y++;
                clearBlock = true;
              } else if (res.move === "d") {
                this.y--;
                clearBlock = true;
              }
              if (clearBlock) {
                this.world.updateBlock(
                  this.x,
                  this.y,
                  this.z,
                  "No block to inspect"
                );
              }
              this.world.updateTurtle(this, this.x, this.y, this.z, this.d);
            }

            this.emit("update");
          }
        }
      } catch (e) {}
    };

    this.ws.on("message", listener);
  }

  mineTunnel(direction: "up" | "forward" | "down", length: number): void {
    const nonce = getNonce();
    this.ws.send(
      JSON.stringify({
        type: "mine",
        length: length || 0,
        direction,
        nonce,
      })
    );

    const listener = async (resp: string) => {
      try {
        let res = JSON.parse(resp);
        if (res.nonce === nonce) {
          if (res.data === "end") {
            await this.updateInventory();
            await this.updateBlock();
            this.fuel = await this.exec<number>("turtle.getFuelLevel()");
            this.ws.off("message", listener);
            return;
          } else {
            if (res.move) {
              let clearBlock = false;
              if (res.move === "l") {
                this.d += 3;
                this.d %= 4;
              } else if (res.move === "r") {
                this.d += 1;
                this.d %= 4;
              } else if (res.move === "f") {
                let deltas = this.getDirectionDelta(this.d);
                this.x += deltas[0];
                this.z += deltas[1];
                clearBlock = true;
              } else if (res.move === "u") {
                this.y++;
                clearBlock = true;
              } else if (res.move === "d") {
                this.y--;
                clearBlock = true;
              }
              if (clearBlock) {
                this.world.updateBlock(
                  this.x,
                  this.y,
                  this.z,
                  "No block to inspect"
                );
              }
              this.world.updateTurtle(this, this.x, this.y, this.z, this.d);
            }
            if (res.blocks) {
              if (direction === "forward") {
                if (res.blocks[0])
                  this.world.updateBlock(
                    this.x,
                    this.y - 1,
                    this.z,
                    res.blocks[0]
                  );
                if (res.blocks[1])
                  this.world.updateBlock(
                    this.x,
                    this.y + 1,
                    this.z,
                    res.blocks[1]
                  );
                let leftDeltas = this.getDirectionDelta((this.d + 3) % 4);
                let rightDeltas = this.getDirectionDelta((this.d + 1) % 4);
                if (res.blocks[2])
                  this.world.updateBlock(
                    this.x + leftDeltas[0],
                    this.y,
                    this.z + leftDeltas[1],
                    res.blocks[2]
                  );
                if (res.blocks[3])
                  this.world.updateBlock(
                    this.x + rightDeltas[0],
                    this.y,
                    this.z + rightDeltas[1],
                    res.blocks[3]
                  );
              } else {
                let forwardDeltas = this.getDirectionDelta(this.d);
                let leftDeltas = this.getDirectionDelta((this.d + 3) % 4);
                let rightDeltas = this.getDirectionDelta((this.d + 1) % 4);
                if (res.blocks[0])
                  this.world.updateBlock(
                    this.x + leftDeltas[0],
                    this.y,
                    this.z + leftDeltas[1],
                    res.blocks[0]
                  );
                if (res.blocks[1])
                  this.world.updateBlock(
                    this.x - forwardDeltas[0],
                    this.y,
                    this.z - forwardDeltas[1],
                    res.blocks[1]
                  );
                if (res.blocks[2])
                  this.world.updateBlock(
                    this.x + rightDeltas[0],
                    this.y,
                    this.z + rightDeltas[1],
                    res.blocks[2]
                  );
                if (res.blocks[3])
                  this.world.updateBlock(
                    this.x + forwardDeltas[0],
                    this.y,
                    this.z + forwardDeltas[1],
                    res.blocks[3]
                  );
              }
            }
            this.emit("update");
          }
        }
      } catch (e) {}
    };

    this.ws.on("message", listener);
  }

  async disconnect() {
    this.ws.close();
  }
}
