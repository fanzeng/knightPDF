import type { FilterPreset, FilterValues } from "./settings";

function handlePresetChange(
  preset: FilterPreset,
  _brightnessSliderElement: HTMLElement,
  _grayscaleSliderElement: HTMLElement,
  _invertSliderElement: HTMLElement,
  _sepiaSliderElement: HTMLElement,
  _extraBrightnessSliderElement: HTMLElement,
  _hueSliderElement: HTMLElement,
  customValues?: FilterValues,
) {
  const brightness = _brightnessSliderElement.noUiSlider;
  const grayness = _grayscaleSliderElement.noUiSlider;
  const inversion = _invertSliderElement.noUiSlider;
  const sepia = _sepiaSliderElement.noUiSlider;
  const hue = _hueSliderElement.noUiSlider;
  const extraBrightness = _extraBrightnessSliderElement.noUiSlider;

  switch (preset) {
    case "crispy":
      brightness.set(7);
      grayness.set(95);
      inversion.set(95);
      sepia.set(55);
      hue.set(180);
      extraBrightness.set(0);
      break;
    case "gentle":
      brightness.set(8);
      grayness.set(0);
      inversion.set(80);
      sepia.set(0);
      hue.set(180);
      extraBrightness.set(-30);
      break;
    case "sepia":
      brightness.set(0);
      grayness.set(0);
      inversion.set(25);
      sepia.set(100);
      hue.set(0);
      extraBrightness.set(-30);
      break;
    case "custom":
      brightness.set(customValues?.brightness ?? 0);
      grayness.set(customValues?.grayscale ?? 0);
      inversion.set(customValues?.invert ?? 0);
      sepia.set(customValues?.sepia ?? 0);
      hue.set(customValues?.hue ?? 0);
      extraBrightness.set(customValues?.extraBrightness ?? 0);
      break;
    default:
      brightness.set(9);
  }

  console.debug(preset, "changed");
}

export { handlePresetChange };
