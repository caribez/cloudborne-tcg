
import card01 from '../assets/sounds/card01.mp3?url';
import card02 from '../assets/sounds/card02.mp3?url';
import card03 from '../assets/sounds/card03.mp3?url';

export class AudioManager {
  private readonly cardSounds = [
    new Audio(card01),
    new Audio(card02),
    new Audio(card03),
  ];

  constructor() {
    for (const sound of this.cardSounds) {
      sound.preload = 'auto';
      sound.volume = 0.65;
    }
  }

  playCard(): void {
    const index = Math.floor(
      Math.random() * this.cardSounds.length
    );

    const sound = this.cardSounds[index]!;

    sound.currentTime = 0;

    void sound.play().catch((error) => {
      console.warn('Could not play card sound:', error);
    });
  }
}
