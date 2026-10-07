import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

export function PhaserGame(): React.JSX.Element {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mount.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount.current,
      width: 1100,
      height: 700,
      backgroundColor: '#28323c',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [GameScene],
      render: { antialias: true },
    });
    return () => game.destroy(true);
  }, []);
  return <div ref={mount} className="game-canvas" />;
}
