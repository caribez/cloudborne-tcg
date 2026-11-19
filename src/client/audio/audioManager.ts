
import card01 from '../assets/sounds/card01.mp3?url';
import card02 from '../assets/sounds/card02.mp3?url';
import card03 from '../assets/sounds/card03.mp3?url';
import cardSelect01 from '../assets/sounds/card_select01.mp3?url';
import cardSelect02 from '../assets/sounds/card_select02.mp3?url';
import cardSelect03 from '../assets/sounds/card_select03.mp3?url';
import music01 from '../assets/music/cloudborne-ingame-v01.mp3?url';

export class AudioManager {
  private readonly cardSounds = [
    new Audio(card01),
    new Audio(card02),
    new Audio(card03),
  ];

  private readonly cardSelectSounds = [
  new Audio(cardSelect01),
  new Audio(cardSelect02),
  new Audio(cardSelect03),
];

  private readonly music = new Audio(music01);

  constructor() {
    for (const sound of this.cardSounds) {
      sound.preload = 'auto';
      sound.volume = 0.65;
    }
    for (const sound of this.cardSelectSounds) {
      sound.preload = 'auto';
      sound.volume = 0.65;
    }
    this.music.preload = 'auto';
this.music.loop = true;
this.music.volume = 0.25;
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

  playCardSelect(): void {
  const index = Math.floor(
    Math.random() * this.cardSelectSounds.length
  );

  const sound = this.cardSelectSounds[index]!;

  sound.currentTime = 0;

  void sound.play().catch((error) => {
    console.warn('Could not play card selection sound:', error);
  });
}

  startMusic(): void {
  if (!this.music.paused) return;

  void this.music.play().catch((error) => {
    console.warn('Could not play music:', error);
  });
}

stopMusic(): void {
  this.music.pause();
  this.music.currentTime = 0;
}

setMusicVolume(volume: number): void {
  this.music.volume = Math.max(0, Math.min(1, volume));
}
}

export const audioManager = new AudioManager();