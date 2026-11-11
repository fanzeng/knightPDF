function toggleDarkConfigurator(darkConfiguratorElement: HTMLElement) {
  if (darkConfiguratorElement.style.visibility === "visible") {
    hideDarkConfigurator(darkConfiguratorElement);
  } else {
    showDarkConfigurator(darkConfiguratorElement);
  }
}

function showDarkConfigurator(darkConfiguratorElement: HTMLElement) {
  darkConfiguratorElement.style.visibility = "visible";
  const dismissLayer = document.getElementById("filter-dismiss-layer");
  if (dismissLayer) {
    dismissLayer.hidden = false;
  }
}

function hideDarkConfigurator(darkConfiguratorElement: HTMLElement) {
  darkConfiguratorElement.style.visibility = "hidden";
  const dismissLayer = document.getElementById("filter-dismiss-layer");
  if (dismissLayer) {
    dismissLayer.hidden = true;
  }
}

export { hideDarkConfigurator, showDarkConfigurator, toggleDarkConfigurator };
