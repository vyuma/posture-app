const STORY_COMPLETED_STORAGE_KEY = "posture.onboarding.storyCompleted.v1";

export function hasCompletedOnboardingStory() {
  try {
    return window.localStorage.getItem(STORY_COMPLETED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveOnboardingStoryCompleted() {
  try {
    window.localStorage.setItem(STORY_COMPLETED_STORAGE_KEY, "true");
  } catch {
    // Ignore storage failures in restricted WebViews.
  }
}
