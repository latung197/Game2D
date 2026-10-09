import { BUILDINGS, MAP } from '../config/map.ts';

export const TICK_SECONDS = 1 / 30;
const ACCELERATION = 1000;
const BRAKING = 1400;
const ROTATION_SPEED = 10;

export type MovementState = {
  x: number;
  y: number;
  rotation: number;
  aimAngle: number;
  velocityX: number;
  velocityY: number;
  health: number;
  status: number;
};
export type MovementInput = { moveX: number; moveY: number; aimAngle: number };

export function quantizeInput(input: MovementInput): MovementInput {
  const circle = Math.PI * 2;
  const aimByte =
    Math.round(((((input.aimAngle % circle) + circle) % circle) * 256) / circle) & 255;
  return {
    moveX: Math.round(Math.max(-1, Math.min(1, input.moveX)) * 127) / 127,
    moveY: Math.round(Math.max(-1, Math.min(1, input.moveY)) * 127) / 127,
    aimAngle: (aimByte * circle) / 256,
  };
}

export function stepMovement(state: MovementState, input: MovementInput): MovementState {
  if (state.health === 0) return { ...state, velocityX: 0, velocityY: 0 };
  const length = Math.max(1, Math.hypot(input.moveX, input.moveY));
  const moveX = input.moveX / length;
  const moveY = input.moveY / length;
  const speed = state.status === 1 ? 126 : 280;
  let changeX = moveX * speed - state.velocityX;
  let changeY = moveY * speed - state.velocityY;
  const changeLength = Math.hypot(changeX, changeY);
  const limit = (moveX === 0 && moveY === 0 ? BRAKING : ACCELERATION) * TICK_SECONDS;
  if (changeLength > limit) {
    changeX *= limit / changeLength;
    changeY *= limit / changeLength;
  }
  let velocityX = state.velocityX + changeX;
  let velocityY = state.velocityY + changeY;
  let x = state.x;
  let y = state.y;
  const nextX = Math.max(35, Math.min(MAP.width - 35, x + velocityX * TICK_SECONDS));
  const nextY = Math.max(35, Math.min(MAP.height - 35, y + velocityY * TICK_SECONDS));
  const blocked = (px: number, py: number) =>
    BUILDINGS.some(
      (building) =>
        px > building.x - 28 &&
        px < building.x + building.w + 28 &&
        py > building.y - 28 &&
        py < building.y + building.h + 28,
    );
  if (blocked(nextX, y) || (nextX === x && velocityX !== 0)) velocityX = 0;
  else x = nextX;
  if (blocked(x, nextY) || (nextY === y && velocityY !== 0)) velocityY = 0;
  else y = nextY;
  let rotation = state.rotation;
  if (moveX !== 0 || moveY !== 0) {
    const desired = Math.atan2(moveY, moveX);
    const difference = Math.atan2(Math.sin(desired - rotation), Math.cos(desired - rotation));
    rotation += Math.max(
      -ROTATION_SPEED * TICK_SECONDS,
      Math.min(ROTATION_SPEED * TICK_SECONDS, difference),
    );
  }
  return { ...state, x, y, velocityX, velocityY, rotation, aimAngle: input.aimAngle };
}
