export type SoundSettings = {
  enabled: boolean;
  volume: number; // 0..1
  selectedSound: string;
  customSounds: string[];
};

export const SOUND_SETTINGS_STORAGE_KEY = "posture.sound.settings.v1";

export const BUILTIN_SOUND_OPTIONS = [
  "/sounds/alexis_gaming_cam-bell-notification-337658.mp3",
  "/sounds/dragon-studio-bell-ring-390294.mp3",
  "/sounds/dragon-studio-cat-meow-401729.mp3",
  "/sounds/dragon-studio-cute-cat-meow-472372.mp3",
  "/sounds/dragon-studio-notification-bell-sound-1-376885.mp3",
  "/sounds/freesound_community-chime-74910.mp3",
  "/sounds/freesound_community-correct-2-46134.mp3",
  "/sounds/freesound_community-ding-101492.mp3",
  "/sounds/freesound_community-snd_fragment_retrievewav-14728.mp3",
  "/sounds/freesounds123-bell-sound-370341.mp3",
  "/sounds/gustavorezende-airport-call-157168.mp3",
  "/sounds/imgmidi-pin-drops-in-a-glass-327219.mp3",
  "/sounds/sound_garage-cat-meow-7-fx-306186.mp3",
  "/sounds/sound_garage-cat-meow-8-fx-306184.mp3",
  "/sounds/soundreality-cat-meow-fx-461188.mp3",
  "/sounds/soundreality-greanpatch-166007.mp3",
  "/sounds/soundshelfstudio-ui-notification-bell-515080.mp3",
  "/sounds/u_3ay6aijdt2-bell1-445873.mp3",
  "/sounds/u_edtmwfwu7c-doorbell-329311.mp3",
  "/sounds/u_yg9qa2ctru-ring-phone-510140.mp3",
  "/sounds/virtual_vibes-cat-meow-sound-383823.mp3",
] as const;

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.7,
  selectedSound: BUILTIN_SOUND_OPTIONS[0],
  customSounds: [],
};
