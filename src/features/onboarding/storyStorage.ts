import { scopedKey } from '../accounts/localScope';
const STORY_COMPLETED_STORAGE_KEY = "posture.onboarding.storyCompleted.v1";

export function hasCompletedOnboardingStory() {
  try {
    return window.localStorage.getItem(scopedKey(STORY_COMPLETED_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export function saveOnboardingStoryCompleted() {
  try {
    window.localStorage.setItem(scopedKey(STORY_COMPLETED_STORAGE_KEY), "true");
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}
